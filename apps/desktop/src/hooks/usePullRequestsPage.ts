import { useState, useCallback } from 'react'
import { useGitHubData } from './useGitHubData'
import { useGitHubRepoIssues } from './useGitHubRepoIssues'
import { useLocalWipRepos } from './useLocalWipRepos'
import { useLaunchpadStore } from '../stores/launchpad.store'
import { isSnoozed, isMyIssue } from '../app/pull-requests/utils'
import type { InnerTab as InnerTabType, MockPR } from '../app/pull-requests/types'

/**
 * Page-level state/derivation for `PullRequestsPage`: pinned PRs, followed PRs, and every KPI/tab
 * count derived from GitHub data. Extracted out of the page component so it stays rendering-only,
 * same shape as `useActionToolbar`/`useWipCommitPanel` elsewhere in the app.
 */
export function usePullRequestsPage() {
  const { activeTab, setActiveTab, savedFilters, snoozed } = useLaunchpadStore()
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())
  const [followedPRs, setFollowedPRs] = useState<MockPR[]>([])
  const { entries: wipEntries } = useLocalWipRepos()

  const {
    prs,
    commitDays,
    yearDays,
    loading,
    isValidating,
    error,
    hasToken,
    username,
    lastRefreshed,
    refresh,
  } = useGitHubData()

  // Issues come from the added repos themselves (not the user's assignee list), so open issues
  // others filed on those repos show up too. Fetched separately since it's keyed on the repo list.
  const { issues, loading: issuesLoading, refresh: refreshIssues } = useGitHubRepoIssues()

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const addFollowed = useCallback(
    (pr: MockPR) =>
      setFollowedPRs((prev) => (prev.some((p) => p.id === pr.id) ? prev : [...prev, pr])),
    []
  )

  const removeFollowed = useCallback(
    (id: string) => setFollowedPRs((prev) => prev.filter((p) => p.id !== id)),
    []
  )

  // Snooze splits the PR list: snoozed PRs leave the normal tabs and feed the dedicated Snoozed tab.
  // Expiry is handled by `isSnoozed` (a past wake time counts as woken), so no timer is needed.
  const now = Date.now()
  const snoozedPRs = prs.filter((p) => isSnoozed(p.id, snoozed, now))
  const visiblePRs = prs.filter((p) => !isSnoozed(p.id, snoozed, now))

  const openPRsCount = visiblePRs.filter((p) => p.status === 'open' || p.status === 'draft').length
  const needsReviewCount = visiblePRs.filter((p) => p.needsMyReview).length
  // Counts reflect the tab's default view — my own open issues — so the KPI/badge match what's shown
  // before the "Mine" filter is cleared (the whole point of the earlier "count said 0" confusion).
  const openIssuesCount = issues.filter(
    (i) => i.status === 'open' && isMyIssue(i, username)
  ).length
  const ciPassRate =
    visiblePRs.length > 0
      ? Math.round(
          (visiblePRs.filter((p) => p.ciStatus === 'success').length / visiblePRs.length) * 100
        )
      : 0
  const weekCommits = commitDays.slice(-7).reduce((s, d) => s + d.commits, 0)

  const tabCounts: Record<InnerTabType, number | undefined> = {
    prs: visiblePRs.filter((p) => p.status !== 'closed' && p.status !== 'merged').length,
    wip: wipEntries.length,
    followed: followedPRs.length,
    issues: issues.filter((i) => i.status === 'open' && isMyIssue(i, username)).length,
    waiting: needsReviewCount,
    snoozed: snoozedPRs.length,
    stats: undefined,
    views: savedFilters.length,
  }

  return {
    activeTab,
    setActiveTab,
    savedFilters,
    prs,
    visiblePRs,
    snoozedPRs,
    issues,
    issuesLoading,
    refreshIssues,
    commitDays,
    yearDays,
    loading,
    isValidating,
    error,
    hasToken,
    username,
    lastRefreshed,
    refresh,
    pinnedIds,
    togglePin,
    followedPRs,
    addFollowed,
    removeFollowed,
    openPRsCount,
    needsReviewCount,
    openIssuesCount,
    ciPassRate,
    weekCommits,
    tabCounts,
  }
}
