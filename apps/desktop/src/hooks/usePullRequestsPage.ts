import { useState, useCallback } from 'react'
import { useGitHubData } from './useGitHubData'
import { useLaunchpadStore } from '../stores/launchpad.store'
import type { InnerTab as InnerTabType, MockPR } from '../app/pull-requests/types'

/**
 * Page-level state/derivation for `PullRequestsPage`: pinned PRs, followed PRs, and every KPI/tab
 * count derived from GitHub data. Extracted out of the page component so it stays rendering-only,
 * same shape as `useActionToolbar`/`useWipCommitPanel` elsewhere in the app.
 */
export function usePullRequestsPage() {
  const { activeTab, setActiveTab, savedFilters } = useLaunchpadStore()
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())
  const [followedPRs, setFollowedPRs] = useState<MockPR[]>([])

  const {
    prs,
    issues,
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

  const openPRsCount = prs.filter((p) => p.status === 'open' || p.status === 'draft').length
  const needsReviewCount = prs.filter((p) => p.needsMyReview).length
  const openIssuesCount = issues.filter((i) => i.status === 'open').length
  const ciPassRate =
    prs.length > 0
      ? Math.round((prs.filter((p) => p.ciStatus === 'success').length / prs.length) * 100)
      : 0
  const weekCommits = commitDays.slice(-7).reduce((s, d) => s + d.commits, 0)

  const tabCounts: Record<InnerTabType, number | undefined> = {
    prs: prs.filter((p) => p.status !== 'closed' && p.status !== 'merged').length,
    followed: followedPRs.length,
    issues: issues.filter((i) => i.status === 'open').length,
    waiting: needsReviewCount,
    stats: undefined,
    views: savedFilters.length,
  }

  return {
    activeTab,
    setActiveTab,
    savedFilters,
    prs,
    issues,
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
