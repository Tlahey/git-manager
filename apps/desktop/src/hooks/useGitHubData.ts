import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { useSettingsStore } from '../stores/settings.store'
import { useNotificationStore } from '../stores/notification.store'
import { useDevFlagsStore } from '../stores/devFlags.store'
import type { MockPR, DayCommit } from '../lib/github/types'
import { useDevFixtures } from './useDevFixtures'
import {
  fetchGitHubPRs,
  fetchGitHubReviewRequestedPRs,
  fetchGitHubPRDetails,
  fetchGitHubCommitCiStatus,
  fetchGitHubContributions,
  parsePRStatus,
} from '../api/github.api'
import { resolveCiStatus } from '../lib/ciStatus'

interface GitHubData {
  prs: MockPR[]
  commitDays: DayCommit[]
  yearDays: DayCommit[]
  loading: boolean
  isValidating: boolean
  error: string | null
  hasToken: boolean
  username: string | null
  lastRefreshed: Date | null
  refresh: () => void
}

/**
 * A fixed "last refreshed" for the fixture path, so it doesn't move on every render.
 *
 * The contribution history that used to sit next to it was generated here too — at module scope,
 * so a production start-up built a year of random days and never used one of them. It now comes
 * from `useDevFixtures`, generated once per load inside the build that can actually show it.
 */
const fallbackRefreshed = new Date()

export function useGitHubData(): GitHubData {
  const mockPRs = useNotificationStore((s) => s.mockPRs)
  const mockGitHub = useDevFlagsStore((s) => s.mockGitHub)
  const { contributions } = useDevFixtures()
  const githubSettings = useSettingsStore((s) => s.settings.github)
  const activeAccount =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) ?? null
  const token = activeAccount?.token ?? null
  const username = activeAccount?.user?.login ?? null

  const hasToken = !!token && !!username

  // Local state to track the last refreshed time
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(
    hasToken ? null : fallbackRefreshed
  )

  const swrKey = hasToken ? ['github-data', token, username] : null

  const { data, error, mutate, isValidating } = useSWR(
    swrKey,
    async ([_, tok, user]) => {
      // 1. Fetch lists
      const [prSearch, reviewSearch] = await Promise.all([
        fetchGitHubPRs(user, tok),
        fetchGitHubReviewRequestedPRs(user, tok),
      ])

      const prMap = new Map<string, MockPR>()
      for (const pr of prSearch) {
        prMap.set(pr.id, pr)
      }
      for (const pr of reviewSearch) {
        pr.needsMyReview = true
        prMap.set(pr.id, pr)
      }

      // 2. Enrich PRs with details and CI status
      const enrichPromises = [...prMap.values()].map(async (pr) => {
        try {
          const ownerRepo = pr.fullName || pr.repoUrl.split('github.com/')[1] || ''
          if (!ownerRepo) return pr

          // Fetch full PR details (gives additions, deletions, changed files count, mergeable status, etc.)
          const prApiUrl = `https://api.github.com/repos/${ownerRepo}/pulls/${pr.number}`
          const full = await fetchGitHubPRDetails(prApiUrl, tok)

          pr.additions = full.additions ?? 0
          pr.deletions = full.deletions ?? 0
          pr.filesChanged = full.changed_files ?? pr.filesChanged
          pr.needsRebase = full.mergeable === false || full.mergeable_state === 'behind'
          pr.headRef = full.head?.ref ?? pr.headRef
          // The lists come from `search/issues`, whose items are issue-shaped and lag behind the
          // real PR by up to a minute. This payload is the authoritative one — re-derive every
          // lifecycle field from it, or a PR merged since the last poll stays labelled as merely
          // closed (red "closed without merging" instead of the purple merge).
          pr.status = parsePRStatus(full)
          pr.isDraft = full.draft ?? pr.isDraft
          pr.autoMerge = !!full.auto_merge

          const sha = full.head?.sha
          const parts = ownerRepo.split('/')
          const owner = parts[0]
          const repo = parts[1]

          if (owner && repo && sha) {
            // Fetch CI Check Runs & Commit Statuses
            const { checkRunsRes, statusRes } = await fetchGitHubCommitCiStatus(
              owner,
              repo,
              sha,
              tok
            )

            const { overall, details } = resolveCiStatus(checkRunsRes, statusRes)
            if (details.length > 0) {
              pr.ciDetails = details
            }
            pr.ciStatus = overall
          }
        } catch (e) {
          console.error('Failed to enrich PR details', pr.number, e)
        }
        return pr
      })
      await Promise.all(enrichPromises)

      // 3. Fetch contributions
      let yearDays: DayCommit[] = []
      try {
        yearDays = await fetchGitHubContributions(user, tok)
      } catch (e) {
        console.warn('Failed to fetch contributions calendar, falling back to empty list', e)
        // Fill with zeros
        yearDays = Array.from({ length: 365 }, (_, i) => {
          const d = new Date()
          d.setDate(d.getDate() - (364 - i))
          return { date: d.toISOString().slice(0, 10), commits: 0 }
        })
      }

      setLastRefreshed(new Date())

      return {
        prs: [...prMap.values()],
        yearDays,
        commitDays: yearDays.slice(-14),
      }
    },
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
    }
  )

  const refresh = useCallback(() => {
    mutate()
  }, [mutate])

  if (!hasToken) {
    // No account connected. The fixtures used to be handed over here unconditionally, which meant
    // a user who simply had not connected GitHub yet was shown ten invented pull requests —
    // invented authors, invented titles — rendered exactly like real ones. Showing fiction as fact
    // is a worse first impression than an empty list, and the list already has a decent empty
    // state. The fixtures are now a development flag (see `devFlags.store.ts`), not a consequence
    // of a missing token.
    return {
      prs: mockGitHub ? mockPRs : [],
      // Already empty unless the flag is on — `useDevFixtures` gates on it too.
      yearDays: contributions,
      commitDays: contributions.slice(-14),
      loading: false,
      isValidating: false,
      error: null,
      hasToken: false,
      username: null,
      lastRefreshed: mockGitHub ? fallbackRefreshed : null,
      refresh,
    }
  }

  return {
    prs: data?.prs ?? [],
    yearDays: data?.yearDays ?? [],
    commitDays: data?.commitDays ?? [],
    loading: !data && !error,
    isValidating,
    error: error ? String(error) : null,
    hasToken: true,
    username,
    lastRefreshed: lastRefreshed,
    refresh,
  }
}
