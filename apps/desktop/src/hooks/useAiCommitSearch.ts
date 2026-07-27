import { useCallback, useRef, useState } from 'react'
import {
  scanCommits,
  SummaryRunCancelled,
  type CommitScanProgress,
  type ScanCommit,
  type ScannedCommit,
} from '@git-manager/ai'
import { apiGetAiCommitScan, commitRelevanceService, commitSearchAnswerService } from '../api/ai.api'
import { apiGetCommitDiff } from '../api/git.api'
import { formatUnifiedPatch } from '../lib/formatUnifiedPatch'
import { useAiCommitSearchStore, type StoredSearchRun } from '../stores/aiCommitSearch.store'
import { useSettingsStore } from '../stores/settings.store'
import { useAiStream } from './useAiStream'

/** Windows the panel offers, in hours. A month is the default because it is the span "recently"
 * usually means for a repository, and the one the feature was asked for. */
export const SEARCH_WINDOWS_HOURS = [24 * 7, 24 * 30, 24 * 90] as const
export const DEFAULT_SEARCH_WINDOW_HOURS = 24 * 30

/**
 * Default ceiling on commits read in one search.
 *
 * Every commit is one model call, so this number *is* the wait: at a handful of seconds per commit
 * on a local model, sixty is already minutes. It is a default rather than a limit — the panel lets
 * the user raise it, having been told what it costs.
 */
export const DEFAULT_MAX_SCANNED_COMMITS = 60

/** What the search is doing, from the user's point of view. */
export type AiCommitSearchPhase =
  | 'idle'
  | 'scanning'
  | 'answering'
  | 'done'
  | 'cancelled'
  | 'error'

export interface AiCommitSearchOptions {
  sinceHours: number
  maxCommits: number
}

/** Stable empty array: a new `[]` per render would make the store selector re-render on every tick. */
const EMPTY_HISTORY: StoredSearchRun[] = []

/** ISO day of an epoch-seconds timestamp — how the window is stated to the model. */
function isoDay(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10)
}

/**
 * Drives the AI commit search: read a window of history commit by commit, then answer the question
 * from what each commit said.
 *
 * The shape is the map/reduce every two-phase AI feature here uses, one level up: `summarizeFiles`
 * reads a changeset file by file, this reads history commit by commit. The reason is the same and
 * the stake is higher — a single prompt fits a few commits' patches, so a one-shot search would
 * answer from whichever commits happened to fit, and "no, that never changed" is a *wrong* answer
 * rather than an incomplete one when the commit that changed it was the one left out.
 *
 * Three states are deliberately distinguished in what a run stores: a commit judged irrelevant, a
 * commit that could not be read, and a window that held more commits than were read. All three
 * qualify a negative answer, and collapsing them would let a provider hiccup or a cap read as "it
 * never happened".
 */
export function useAiCommitSearch(repoPath: string) {
  const { run, cancel, reset, status: streamStatus, error: streamError, text } = useAiStream(
    commitSearchAnswerService.cancel
  )
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  const contextTokens = aiConnection.contextTokens

  const history = useAiCommitSearchStore((s) => s.runs[repoPath] ?? EMPTY_HISTORY)
  const addRun = useAiCommitSearchStore((s) => s.addRun)
  const removeRun = useAiCommitSearchStore((s) => s.removeRun)
  const clearRepo = useAiCommitSearchStore((s) => s.clearRepo)

  /** The map phase's own state, which the stream hook cannot know about. */
  const [scanning, setScanning] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [progress, setProgress] = useState<CommitScanProgress | null>(null)
  /** Every commit's verdict, published as it lands so the panel fills in during the run. */
  const [results, setResults] = useState<ScannedCommit[]>([])
  const [truncated, setTruncated] = useState(false)
  /** The question the visible results answer — kept so the panel labels them after the input moves. */
  const [askedQuestion, setAskedQuestion] = useState('')

  /** Set by `cancelSearch`, polled by the scan between commits: the loop closed over an old render. */
  const cancelledRef = useRef(false)

  const search = useCallback(
    async (question: string, options: AiCommitSearchOptions) => {
      const trimmed = question.trim()
      if (!trimmed) return

      cancelledRef.current = false
      setCancelled(false)
      setScanError(null)
      setResults([])
      setProgress(null)
      setTruncated(false)
      setAskedQuestion(trimmed)
      setScanning(true)

      let scan
      try {
        scan = await apiGetAiCommitScan(repoPath, options.sinceHours, options.maxCommits)
      } catch (err) {
        setScanning(false)
        setScanError(String(err))
        return
      }
      setTruncated(scan.truncated)

      let scanned: ScannedCommit[] = []
      try {
        scanned = await scanCommits(
          scan.commits,
          async (commit: ScanCommit) => {
            const diff = await apiGetCommitDiff(repoPath, commit.oid)
            return diff.files.map(formatUnifiedPatch).join('\n')
          },
          (input) => commitRelevanceService.run(aiConnection, input),
          { question: trimmed, language, contextTokens },
          {
            onProgress: setProgress,
            onResult: (result) => setResults((current) => [...current, result]),
            shouldCancel: () => cancelledRef.current,
          }
        )
      } catch (err) {
        setScanning(false)
        setProgress(null)
        if (err instanceof SummaryRunCancelled) setCancelled(true)
        else setScanError(String(err))
        return
      }

      setScanning(false)
      setProgress({ phase: 'composing', completed: 0, total: 1 })

      const relevant = scanned.filter((r) => r.relevant)
      const failed = scanned.filter((r) => r.failed).length
      // The denominator of every claim the answer makes: commits actually read, not commits listed.
      // A commit whose call failed said nothing, and must not be counted as having said "no".
      const readCount = scanned.length - failed

      await run(
        (requestId) =>
          commitSearchAnswerService.run(
            aiConnection,
            {
              question: trimmed,
              repoName: scan.repoName,
              branch: scan.branch,
              window: `since ${isoDay(scan.sinceEpoch)}`,
              findings: relevant.map((r) => ({
                shortOid: r.commit.shortOid,
                subject: r.commit.subject,
                date: isoDay(r.commit.timestamp),
                author: r.commit.author,
                finding: r.finding,
                files: r.files,
              })),
              scanned: readCount,
              truncated: scan.truncated,
              language,
              contextTokens,
            },
            requestId
          ),
        {
          onComplete: (answer) => {
            setProgress(null)
            const stored: StoredSearchRun = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              question: trimmed,
              answer,
              matches: relevant.map((r) => ({
                oid: r.commit.oid,
                shortOid: r.commit.shortOid,
                subject: r.commit.subject,
                author: r.commit.author,
                timestamp: r.commit.timestamp,
                finding: r.finding,
                files: r.files,
              })),
              scanned: readCount,
              failed,
              truncated: scan.truncated,
              sinceHours: options.sinceHours,
              sinceEpoch: scan.sinceEpoch,
              ranAt: Date.now(),
              model: aiConnection.model,
            }
            addRun(repoPath, stored)
          },
        }
      )
      setProgress(null)
    },
    [repoPath, aiConnection, language, contextTokens, run, addRun]
  )

  /** Stops the scan at its next commit boundary, then the answer stream if it has started. */
  const cancelSearch = useCallback(async () => {
    cancelledRef.current = true
    setCancelled(true)
    setProgress(null)
    await cancel()
  }, [cancel])

  const clearSearch = useCallback(() => {
    cancelledRef.current = false
    setCancelled(false)
    setScanning(false)
    setScanError(null)
    setProgress(null)
    setResults([])
    setAskedQuestion('')
    setTruncated(false)
    reset()
  }, [reset])

  const phase: AiCommitSearchPhase = cancelled
    ? 'cancelled'
    : scanning
      ? 'scanning'
      : scanError
        ? 'error'
        : streamStatus === 'connecting' || streamStatus === 'streaming'
          ? 'answering'
          : streamStatus === 'error'
            ? 'error'
            : streamStatus === 'done'
              ? 'done'
              : 'idle'

  return {
    search,
    cancel: cancelSearch,
    clear: clearSearch,
    phase,
    isRunning: phase === 'scanning' || phase === 'answering',
    error: scanError ?? streamError,
    answer: text,
    askedQuestion,
    progress,
    results,
    matches: results.filter((r) => r.relevant),
    failedCount: results.filter((r) => r.failed).length,
    truncated,
    history,
    removeRun,
    clearHistory: clearRepo,
  }
}
