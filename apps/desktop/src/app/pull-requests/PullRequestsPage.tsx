import {
  Rocket,
  WifiOff,
  CheckCircle2,
  Clock,
  RefreshCw,
  GitPullRequest,
  Eye,
  AlertCircle,
  BarChart2,
  Sliders,
  GitCommit,
  BookOpen,
} from 'lucide-react'
import { usePullRequestsPage } from '../../hooks/usePullRequestsPage'
import { timeAgo } from './utils'
import { Spinner } from '@git-manager/ui'
import { InnerTab, KpiCard } from '@git-manager/components'
import { PullRequestsTab } from './components/PullRequestsTab'
import { FollowedPRsTab } from './components/FollowedPRsTab'
import { IssuesTab } from './components/IssuesTab'
import { WaitingForReviewTab } from './components/WaitingForReviewTab'
import { CommitStatsTab } from './components/CommitStatsTab'
import { CustomViewsTab } from './components/CustomViewsTab'
import { appEventBus } from '../../lib/appEventBus'
import { defineTabs, renderActiveTab, type TabDef } from '../../lib/navigation/tabRegistry'
import type { InnerTab as InnerTabType } from './types'

export function PullRequestsPage() {
  const {
    activeTab,
    setActiveTab,
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
  } = usePullRequestsPage()

  const PR_TABS: TabDef<InnerTabType>[] = defineTabs([
    {
      id: 'prs',
      label: 'My Pull Requests',
      icon: GitPullRequest,
      render: () => (
        <PullRequestsTab
          allPRs={prs}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          loading={loading}
        />
      ),
    },
    {
      id: 'followed',
      label: 'Followed PRs',
      icon: BookOpen,
      render: () => (
        <FollowedPRsTab
          followedPRs={followedPRs}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          onAddFollowed={addFollowed}
          onRemoveFollowed={removeFollowed}
          loading={loading}
        />
      ),
    },
    {
      id: 'issues',
      label: 'My Issues',
      icon: AlertCircle,
      render: () => <IssuesTab allIssues={issues} loading={loading} />,
    },
    {
      id: 'waiting',
      label: 'Waiting for Review',
      icon: Eye,
      render: () => (
        <WaitingForReviewTab
          allPRs={prs}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          loading={loading}
        />
      ),
    },
    {
      id: 'stats',
      label: 'Commit Stats',
      icon: BarChart2,
      render: () => (
        <CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={loading} />
      ),
    },
    {
      id: 'views',
      label: 'Custom Views',
      icon: Sliders,
      render: () => (
        <CustomViewsTab
          allPRs={prs}
          allIssues={issues}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          loading={loading}
        />
      ),
    },
  ])

  function selectTab(id: InnerTabType) {
    setActiveTab(id)
    if (id === 'waiting') appEventBus.notify('view_waiting_reviews')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Page Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card/50 px-5 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-bold tracking-wide text-foreground">Launchpad</h1>
        </div>
        <div className="h-4 w-px bg-border" />
        {hasToken ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {loading || isValidating ? (
              <>
                <Spinner className="h-3 w-3" /> Fetching…
              </>
            ) : error ? (
              <>
                <WifiOff className="h-3 w-3 text-destructive" />{' '}
                <span className="text-destructive">{error}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 text-green-400" /> Synced as{' '}
                <strong className="ml-0.5 text-foreground">{username}</strong>
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
            disabled={isValidating}
            data-testid="manual-refresh-button"
            className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent/40 hover:text-foreground disabled:opacity-40"
            title="Refresh now"
          >
            <RefreshCw className={`h-3 w-3 ${isValidating ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      {/* Loading progress bar container - fixed height to prevent CLS */}
      <div
        className="relative h-[2px] w-full shrink-0 overflow-hidden bg-border/10"
        data-testid="refresh-progress-bar"
      >
        {isValidating && (
          <div className="animate-shimmer absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent" />
        )}
      </div>

      {/* Overview KPI Bar */}
      <div className="flex shrink-0 items-stretch gap-3 border-b border-border bg-card/20 px-5 py-3">
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
      <div className="flex shrink-0 items-center border-b border-border bg-card/30 px-3">
        {PR_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <InnerTab
              key={tab.id}
              active={activeTab === tab.id}
              onClick={() => selectTab(tab.id)}
              count={tabCounts[tab.id]}
              loading={loading}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />} {tab.label}
            </InnerTab>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-0 flex-1">{renderActiveTab(PR_TABS, activeTab)}</div>
    </div>
  )
}
