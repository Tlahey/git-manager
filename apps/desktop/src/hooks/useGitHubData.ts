import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { useSettingsStore } from '../stores/settings.store'
import { useNotificationStore } from '../stores/notification.store'
import type { MockPR, MockIssue, DayCommit, CiStatus, CiDetail } from '../app/pull-requests/types'
import { MOCK_ISSUES, getMockContributions } from '../app/pull-requests/mockData'
import {
  fetchGitHubPRs,
  fetchGitHubReviewRequestedPRs,
  fetchGitHubIssues,
  fetchGitHubPRDetails,
  fetchGitHubCommitCiStatus,
  fetchGitHubContributions,
} from '../api/github.api'

interface GitHubData {
  prs: MockPR[]
  issues: MockIssue[]
  commitDays: DayCommit[]
  yearDays: DayCommit[]
  loading: boolean
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
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(hasToken ? null : fallbackRefreshed)

  const swrKey = hasToken ? ['github-data', token, username] : null

  const { data, error, mutate } = useSWR(
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
            const { checkRunsRes, statusRes } = await fetchGitHubCommitCiStatus(owner, repo, sha, tok)

            const checkRuns = checkRunsRes?.check_runs ?? []
            const totalCheckRuns = checkRunsRes?.total_count ?? 0
            const statuses = statusRes?.statuses ?? []
            const commitStatusState = statusRes?.state
            const totalStatuses = statusRes?.total_count ?? 0

            const hasCheckRuns = totalCheckRuns > 0
            const hasStatuses = totalStatuses > 0

            let resolvedCiStatus: CiStatus = null

            if (hasCheckRuns || hasStatuses) {
              const hasFailure =
                (hasCheckRuns &&
                  checkRuns.some((run: any) =>
                    ['failure', 'timed_out', 'cancelled'].includes(run.conclusion)
                  )) ||
                (hasStatuses && ['failure', 'error'].includes(commitStatusState))

              if (hasFailure) {
                resolvedCiStatus = 'failure'
              } else {
                const hasRunning =
                  (hasCheckRuns &&
                    checkRuns.some((run: any) => ['in_progress', 'queued'].includes(run.status))) ||
                  (hasStatuses && commitStatusState === 'pending')

                if (hasRunning) {
                  resolvedCiStatus = 'running'
                } else {
                  const hasSuccess =
                    (hasCheckRuns && checkRuns.some((run: any) => run.conclusion === 'success')) ||
                    (hasStatuses && commitStatusState === 'success')

                  if (hasSuccess) {
                    resolvedCiStatus = 'success'
                  } else {
                    const allSkipped =
                      hasCheckRuns &&
                      checkRuns.every((run: any) => ['skipped', 'neutral'].includes(run.conclusion))
                    resolvedCiStatus = allSkipped ? 'skipped' : null
                  }
                }
              }

              // Build details list
              const checkRunsDetails: CiDetail[] = checkRuns.map((run: any) => {
                let s: CiDetail['status'] = 'unknown'
                if (run.status === 'in_progress' || run.status === 'queued') {
                  s = 'running'
                } else if (run.status === 'completed') {
                  if (run.conclusion === 'success') s = 'success'
                  else if (['failure', 'timed_out', 'cancelled'].includes(run.conclusion)) s = 'failure'
                  else if (['skipped', 'neutral'].includes(run.conclusion)) s = 'skipped'
                }
                return {
                  name: run.name ?? 'Check run',
                  status: s,
                  url: run.html_url,
                }
              })

              const statusesDetails: CiDetail[] = statuses.map((status: any) => {
                let s: CiDetail['status'] = 'unknown'
                if (status.state === 'success') s = 'success'
                else if (['failure', 'error'].includes(status.state)) s = 'failure'
                else if (status.state === 'pending') s = 'running'
                return {
                  name: status.context ?? 'Status check',
                  status: s,
                  url: status.target_url,
                }
              })

              pr.ciDetails = [...checkRunsDetails, ...statusesDetails]
            }
            pr.ciStatus = resolvedCiStatus
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
    error: error ? String(error) : null,
    hasToken: true,
    username,
    lastRefreshed: lastRefreshed,
    refresh,
  }
}
