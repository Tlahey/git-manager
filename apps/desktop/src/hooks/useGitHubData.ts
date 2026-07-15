import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { useSettingsStore } from '../stores/settings.store'
import { useNotificationStore } from '../stores/notification.store'
import type { MockPR, MockIssue, DayCommit } from '../app/pull-requests/types'
import { MOCK_ISSUES, getMockContributions } from '../app/pull-requests/mockData'
import {
  fetchGitHubPRs,
  fetchGitHubReviewRequestedPRs,
  fetchGitHubIssues,
  fetchGitHubPRDetails,
  fetchGitHubCommitCiStatus,
  fetchGitHubContributions,
} from '../api/github.api'
import { resolveCiStatus } from '../lib/ciStatus'

interface GitHubData {
  prs: MockPR[]
  issues: MockIssue[]
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

// Generate fallback contributions once to prevent layout shifts/regeneration on renders
const fallbackContributions = getMockContributions()
const fallbackCommitDays = fallbackContributions.slice(-14)
const fallbackRefreshed = new Date()

export function useGitHubData(): GitHubData {
  const mockPRs = useNotificationStore((s) => s.mockPRs)
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
      const [prSearch, reviewSearch, issueSearch] = await Promise.all([
        fetchGitHubPRs(user, tok),
        fetchGitHubReviewRequestedPRs(user, tok),
        fetchGitHubIssues(user, tok),
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
        issues: issueSearch,
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
    return {
      prs: mockPRs,
      issues: MOCK_ISSUES,
      yearDays: fallbackContributions,
      commitDays: fallbackCommitDays,
      loading: false,
      isValidating: false,
      error: null,
      hasToken: false,
      username: null,
      lastRefreshed: fallbackRefreshed,
      refresh,
    }
  }

  return {
    prs: data?.prs ?? [],
    issues: data?.issues ?? [],
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
