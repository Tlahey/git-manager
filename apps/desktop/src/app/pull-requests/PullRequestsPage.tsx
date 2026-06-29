import { useState, useCallback } from 'react'
import {
  Rocket,
  WifiOff,
  CheckCircle2,
  Loader2,
  Clock,
  RefreshCw,
  GitPullRequest,
  Eye,
  AlertCircle,
  BarChart2,
  Sliders,
  GitCommit,
} from 'lucide-react'
import { useGitHubData } from '../../hooks/useGitHubData'
import { useLaunchpadStore } from '../../stores/launchpad.store'
import { timeAgo } from './utils'
import { InnerTab } from './components/InnerTab'
import { KpiCard } from './components/KpiCard'
import { PullRequestsTab } from './components/PullRequestsTab'
import { IssuesTab } from './components/IssuesTab'
import { WaitingForReviewTab } from './components/WaitingForReviewTab'
import { CommitStatsTab } from './components/CommitStatsTab'
import { CustomViewsTab } from './components/CustomViewsTab'
import type { InnerTab as InnerTabType, MockPR } from './types'

export function PullRequestsPage() {
  const { activeTab, setActiveTab, savedFilters } = useLaunchpadStore()
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())
  const [followedPRs, setFollowedPRs] = useState<MockPR[]>([])

  const {
    prs,
    issues,
    commitDays,
    yearDays,
    loading,
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
    prs:
      prs.filter((p) => p.status !== 'closed' && p.status !== 'merged').length +
      followedPRs.length,
    issues: issues.filter((i) => i.status === 'open').length,
    waiting: needsReviewCount,
    stats: undefined,
    views: savedFilters.length,
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Page Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card/50 px-5 py-2.5 shrink-0 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-bold text-foreground tracking-wide">Launchpad</h1>
        </div>
        <div className="h-4 w-px bg-border" />
        {hasToken ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Fetching…
              </>
            ) : error ? (
              <>
                <WifiOff className="h-3 w-3 text-destructive" />{' '}
                <span className="text-destructive">{error}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 text-green-400" /> Synced as{' '}
                <strong className="text-foreground ml-0.5">{username}</strong>
              </>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
            <WifiOff className="h-3 w-3" /> No GitHub account — showing demo data
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {lastRefreshed && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
              <Clock className="h-3 w-3" /> {timeAgo(lastRefreshed)}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/40 transition-colors disabled:opacity-40"
            title="Refresh now"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      {/* Overview KPI Bar */}
      <div className="flex items-stretch gap-3 px-5 py-3 border-b border-border bg-card/20 shrink-0">
        <KpiCard
          icon={<GitPullRequest className="h-3.5 w-3.5 text-green-400" />}
          label="Open PRs"
          value={openPRsCount}
          sub="Across all repos"
          loading={loading}
        />
        <KpiCard
          icon={<Eye className="h-3.5 w-3.5 text-orange-400" />}
          label="Needs review"
          value={needsReviewCount}
          sub="Waiting for you"
          accent="hover:border-orange-500/20"
          loading={loading}
        />
        <KpiCard
          icon={<AlertCircle className="h-3.5 w-3.5 text-blue-400" />}
          label="Open issues"
          value={openIssuesCount}
          sub="Assigned or watching"
          loading={loading}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
          label="CI pass rate"
          value={`${ciPassRate}%`}
          sub="Last 30 days"
          loading={loading}
        />
        <KpiCard
          icon={<GitCommit className="h-3.5 w-3.5 text-purple-400" />}
          label="Commits"
          value={weekCommits}
          sub="This week"
          loading={loading}
        />
      </div>

      {/* Inner Tab Bar */}
      <div className="flex items-center border-b border-border bg-card/30 shrink-0 px-3">
        <InnerTab active={activeTab === 'prs'} onClick={() => setActiveTab('prs')} count={tabCounts.prs} loading={loading}>
          <GitPullRequest className="h-3.5 w-3.5" /> My Pull Requests
        </InnerTab>
        <InnerTab
          active={activeTab === 'issues'}
          onClick={() => setActiveTab('issues')}
          count={tabCounts.issues}
          loading={loading}
        >
          <AlertCircle className="h-3.5 w-3.5" /> My Issues
        </InnerTab>
        <InnerTab
          active={activeTab === 'waiting'}
          onClick={() => setActiveTab('waiting')}
          count={tabCounts.waiting}
          loading={loading}
        >
          <Eye className="h-3.5 w-3.5" /> Waiting for Review
        </InnerTab>
        <InnerTab active={activeTab === 'stats'} onClick={() => setActiveTab('stats')}>
          <BarChart2 className="h-3.5 w-3.5" /> Commit Stats
        </InnerTab>
        <InnerTab
          active={activeTab === 'views'}
          onClick={() => setActiveTab('views')}
          count={tabCounts.views}
          loading={loading}
        >
          <Sliders className="h-3.5 w-3.5" /> Custom Views
        </InnerTab>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'prs' && (
          <PullRequestsTab
            allPRs={prs}
            followedPRs={followedPRs}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
            onAddFollowed={addFollowed}
            onRemoveFollowed={removeFollowed}
            loading={loading}
          />
        )}
        {activeTab === 'issues' && <IssuesTab allIssues={issues} loading={loading} />}
        {activeTab === 'waiting' && (
          <WaitingForReviewTab
            allPRs={prs}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
            loading={loading}
          />
        )}
        {activeTab === 'stats' && (
          <CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={loading} />
        )}
        {activeTab === 'views' && (
          <CustomViewsTab
            allPRs={prs}
            allIssues={issues}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
            loading={loading}
          />
        )}
      </div>
    </div>
  )
}
