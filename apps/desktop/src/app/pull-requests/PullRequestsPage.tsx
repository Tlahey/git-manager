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
  FolderGit2,
  BellOff,
} from 'lucide-react'
import { useState } from 'react'
import { usePullRequestsPage } from '../../hooks/usePullRequestsPage'
import { timeAgo } from './utils'
import { Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { InnerTab, KpiCard } from '@git-manager/components'
import { OpenPrContext } from './OpenPrContext'
import { PrSidePanel } from './components/PrSidePanel'
import { PullRequestsTab } from './components/PullRequestsTab'
import { WipTab } from './components/WipTab'
import { FollowedPRsTab } from './components/FollowedPRsTab'
import { IssuesTab } from './components/IssuesTab'
import { WaitingForReviewTab } from './components/WaitingForReviewTab'
import { SnoozedPRsTab } from './components/SnoozedPRsTab'
import { CommitStatsTab } from './components/CommitStatsTab'
import { CustomViewsTab } from './components/CustomViewsTab'
import { appEventBus } from '../../lib/appEventBus'
import { defineTabs, renderActiveTab, type TabDef } from '../../lib/navigation/tabRegistry'
import type { InnerTab as InnerTabType, MockPR } from './types'

export function PullRequestsPage() {
  const { t } = useTranslation('launchpad')
  const [openedPr, setOpenedPr] = useState<MockPR | null>(null)
  const {
    activeTab,
    setActiveTab,
    visiblePRs,
    snoozedPRs,
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
      label: t('tab.myPrs'),
      icon: GitPullRequest,
      render: () => (
        <PullRequestsTab
          allPRs={visiblePRs}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          loading={loading}
        />
      ),
    },
    {
      id: 'wip',
      label: t('tab.wip'),
      icon: FolderGit2,
      render: () => <WipTab />,
    },
    {
      id: 'followed',
      label: t('tab.followed'),
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
      label: t('tab.myIssues'),
      icon: AlertCircle,
      render: () => <IssuesTab allIssues={issues} loading={loading} />,
    },
    {
      id: 'waiting',
      label: t('tab.waiting'),
      icon: Eye,
      render: () => (
        <WaitingForReviewTab
          allPRs={visiblePRs}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          loading={loading}
        />
      ),
    },
    {
      id: 'snoozed',
      label: t('tab.snoozed'),
      icon: BellOff,
      render: () => (
        <SnoozedPRsTab
          snoozedPRs={snoozedPRs}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          loading={loading}
        />
      ),
    },
    {
      id: 'stats',
      label: t('tab.commitStats'),
      icon: BarChart2,
      render: () => (
        <CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={loading} />
      ),
    },
    {
      id: 'views',
      label: t('tab.customViews'),
      icon: Sliders,
      render: () => (
        <CustomViewsTab
          allPRs={visiblePRs}
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
    <OpenPrContext.Provider value={setOpenedPr}>
      <div className="relative flex h-full overflow-hidden bg-background">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
                  <Spinner className="h-3 w-3" /> {t('page.fetching')}
                </>
              ) : error ? (
                <>
                  <WifiOff className="h-3 w-3 text-destructive" />{' '}
                  <span className="text-destructive">{error}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-400" /> {t('page.syncedAs')}{' '}
                  <strong className="ml-0.5 text-foreground">{username}</strong>
                </>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
              <WifiOff className="h-3 w-3" /> {t('page.noAccount')}
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
              title={t('page.refreshNow')}
            >
              <RefreshCw className={`h-3 w-3 ${isValidating ? 'animate-spin' : ''}`} />{' '}
              {t('page.refresh')}
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
            label={t('kpi.openPrs')}
            value={openPRsCount}
            sub={t('kpi.openPrsSub')}
            loading={loading}
          />
          <KpiCard
            icon={<Eye className="h-3.5 w-3.5 text-orange-400" />}
            label={t('kpi.needsReview')}
            value={needsReviewCount}
            sub={t('kpi.needsReviewSub')}
            accent="hover:border-orange-500/20"
            loading={loading}
          />
          <KpiCard
            icon={<AlertCircle className="h-3.5 w-3.5 text-blue-400" />}
            label={t('kpi.openIssues')}
            value={openIssuesCount}
            sub={t('kpi.openIssuesSub')}
            loading={loading}
          />
          <KpiCard
            icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
            label={t('kpi.ciPassRate')}
            value={`${ciPassRate}%`}
            sub={t('kpi.ciPassRateSub')}
            loading={loading}
          />
          <KpiCard
            icon={<GitCommit className="h-3.5 w-3.5 text-purple-400" />}
            label={t('kpi.commits')}
            value={weekCommits}
            sub={t('kpi.commitsSub')}
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
        {openedPr && <PrSidePanel pr={openedPr} onClose={() => setOpenedPr(null)} />}
      </div>
    </OpenPrContext.Provider>
  )
}
