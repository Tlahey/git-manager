import { useCallback, useEffect, useRef, useState } from 'react'
import { verifyUpgradeRiskPaths, type UpgradeRiskResult } from '@git-manager/ai'
import type { OutdatedPackage, PackageChangelog } from '@git-manager/git-types'
import { upgradeRiskService } from '../api/ai.api'
import { apiScanPackageUsage } from '../api/packageHealth.api'
import { useSettingsStore } from '../stores/settings.store'

/**
 * Which part of the run is happening.
 *
 * The call has no timeout (see `upgradeRiskFeature.timeoutSeconds`), so "it is
 * still working" has to be visible or an unbounded wait is indistinguishable from
 * a hang. The two phases are genuinely different lengths — the scan is a
 * filesystem walk measured in milliseconds, the model call can run for minutes —
 * so naming which one is current is what makes the wait legible.
 */
export type UpgradeRiskPhase = 'idle' | 'scanning' | 'reading'

interface UpgradeRiskState {
  result: UpgradeRiskResult | null
  phase: UpgradeRiskPhase
  error: string | null
  /** Files the scan found, shown while the model reads so the wait has content. */
  fileCount: number | null
}

const IDLE: UpgradeRiskState = { result: null, phase: 'idle', error: null, fileCount: null }

/**
 * Assesses what one dependency upgrade would break in this repo.
 *
 * Two inputs, gathered here rather than in the feature: the release notes the
 * changelog panel already has, and a fresh scan of the repo's import sites. The
 * scan is the reason the answer can be specific — without it the model can only
 * restate the notes.
 *
 * `verifyUpgradeRiskPaths` is applied with the scanned file list so a path the
 * model invented is dropped before it reaches the UI as somewhere to go and look.
 * The feature's own `parse` cannot do that: it never sees the input.
 */
export function useUpgradeRisk(repoPath: string) {
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  const [state, setState] = useState<UpgradeRiskState>(IDLE)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const running = state.phase !== 'idle'
  // Kept in a ref so a result arriving after the panel closed cannot set state on
  // an unmounted component — the run is minutes long and easily outlives the view.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!running) {
      setElapsedSeconds(0)
      return
    }
    const startedAt = Date.now()
    const timer = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    )
    return () => clearInterval(timer)
  }, [running])

  const reset = useCallback(() => setState(IDLE), [])

  const assess = useCallback(
    async (entry: OutdatedPackage, changelog: PackageChangelog | undefined) => {
      setState({ result: null, phase: 'scanning', error: null, fileCount: null })
      try {
        const usage = await apiScanPackageUsage(repoPath, entry.name)
        if (!mounted.current) return
        setState({
          result: null,
          phase: 'reading',
          error: null,
          fileCount: usage.fileCount,
        })

        // The notes as markdown, newest first — the same text the panel shows.
        const notes = (changelog?.releases ?? [])
          .map(
            (release) =>
              `## ${release.tag}${release.name ? ` — ${release.name}` : ''}\n${release.body}`
          )
          .join('\n\n')

        const verdict = await upgradeRiskService.run(aiConnection, {
          package: entry.name,
          from: entry.current,
          to: entry.latest,
          changelog: notes,
          changelogMatched: changelog?.matched ?? false,
          usage,
          language,
          contextTokens: aiConnection.contextTokens,
        })
        if (!mounted.current) return

        setState({
          result: verifyUpgradeRiskPaths(verdict, usage.files),
          phase: 'idle',
          error: null,
          fileCount: usage.fileCount,
        })
      } catch (error) {
        if (!mounted.current) return
        setState({ result: null, phase: 'idle', error: String(error), fileCount: null })
      }
    },
    [repoPath, aiConnection, language]
  )

  return { ...state, running, elapsedSeconds, assess, reset }
}
