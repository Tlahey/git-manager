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
  BookOpen,
  FolderGit2,
  BellOff,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { usePullRequestsPage } from './hooks/usePullRequestsPage'
import { usePendingPrOpen } from './hooks/usePendingPrOpen'
import { timeAgo } from '../../lib/relativeDate'
import { Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { InnerTab } from '@git-manager/components'
import { OpenPrContext } from './components/OpenPrContext'
import { OpenIssueContext } from './components/OpenIssueContext'
import { PrSidePanel } from './components/PrSidePanel'
import { IssueSidePanel } from './components/IssueSidePanel'
import { ConnectGithubBanner } from './components/ConnectGithubBanner'
import { LaunchpadKpiBar } from './components/LaunchpadKpiBar'
import { LaunchpadToolbar } from './components/LaunchpadToolbar'
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
import { useLaunchpadControlsStore } from './stores/launchpadControls.store'
import { useGlobalLoadingWhile } from '../../hooks/useGlobalLoadingWhile'
import { TAB_REQUIRES_GITHUB, resolveActiveTab } from './lib/githubTabs.config'
import type { MockPR, MockIssue } from '../../lib/github/types'
import type { InnerTab as InnerTabType } from './lib/launchpadTypes'

interface PullRequestsPageProps {
  /** Opens Settings on the Integrations page — what the signed-out state's one action does. */
  onOpenSettings?: () => void
}

export function PullRequestsPage({ onOpenSettings }: PullRequestsPageProps = {}) {
  const { t } = useTranslation('launchpad')
  const [openedPr, setOpenedPr] = useState<MockPR | null>(null)
  const [openedIssue, setOpenedIssue] = useState<MockIssue | null>(null)

  // Clear the global search when leaving the Launchpad so the filter doesn't linger next visit.
  useEffect(() => () => useLaunchpadControlsStore.getState().reset(), [])
  const {
    activeTab,
    setActiveTab,
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
    githubConnected,
    showConnectBanner,
    dismissConnectBanner,
    isMocked,
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

  // Drive the global loading overlay while the Launchpad's first data load is in flight. This also
  // holds the startup splash until the Launchpad is ready when it's the active tab (see
  // useAppReadySplash) — no token means an instant mock load, so nothing blocks in that case.
  useGlobalLoadingWhile(loading, t('page.fetching'))

  // A notification click for a PR whose repo isn't cloned locally lands here instead of on a repo
  // tab's PR page (see `lib/notifications/notificationRouting.ts`); open its panel now.
  usePendingPrOpen({ prs, loading, onOpen: setOpenedPr })

  const ALL_TABS: TabDef<InnerTabType>[] = defineTabs([
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
      render: () => (
        <IssuesTab
          allIssues={issues}
          loading={issuesLoading}
          currentUser={username}
          pinnedIds={pinnedIds}
          onTogglePin={togglePin}
          onIssueChanged={refreshIssues}
        />
      ),
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

  // Signed out, only the tabs that read the local disk remain — see `githubTabs.config.ts`. The
  // persisted active tab is resolved against what's left rather than rewritten, so signing back in
  // returns the user to the tab they were on.
  const PR_TABS = githubConnected
    ? ALL_TABS
    : ALL_TABS.filter((tab) => !TAB_REQUIRES_GITHUB[tab.id])
  const visibleTab = resolveActiveTab(activeTab, githubConnected)

  function selectTab(id: InnerTabType) {
    setActiveTab(id)
    if (id === 'waiting') appEventBus.notify('view_waiting_reviews')
  }

  return (
    <OpenPrContext.Provider value={setOpenedPr}>
      <OpenIssueContext.Provider value={setOpenedIssue}>
        <div className="relative flex h-full overflow-hidden bg-background">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Page Header */}
            <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card/50 px-5 py-2.5 backdrop-blur-xs">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <h1 className="text-sm font-bold tracking-wide text-foreground">Launchpad</h1>
              </div>
              {/* The divider belongs to the status that follows it — signed out with no fixtures
                  there is no status, and a rule floating beside the title is just debris. */}
              {(hasToken || isMocked) && <div className="h-4 w-px bg-border" />}
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
                // Only the fixtures get a warning here. Being signed out is not a fault worth an
                // amber strip in the title bar: the page below already says it, once, in the
                // connect banner — and says what to do about it, which a status pill cannot. Two
                // notices for one fact left the header shouting about a state the user had chosen.
                // Invented pull requests are a different matter and keep their warning.
                isMocked && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
                    <WifiOff className="h-3 w-3" /> {t('page.demoData')}
                  </span>
                )
              )}
              <div className="ml-auto flex items-center gap-3">
                {/* Nothing to refresh, and no last-refresh time to report, without an account. */}
                {githubConnected && (
                  <>
                    {lastRefreshed && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                        <Clock className="h-3 w-3" /> {timeAgo(lastRefreshed)}
                      </span>
                    )}
                    <button
                      onClick={refresh}
                      disabled={isValidating}
                      data-testid="manual-refresh-button"
                      className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:enabled:border-border/80 hover:enabled:bg-accent/40 hover:enabled:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      title={t('page.refreshNow')}
                    >
                      <RefreshCw className={`h-3 w-3 ${isValidating ? 'animate-spin' : ''}`} />{' '}
                      {t('page.refresh')}
                    </button>
                  </>
                )}
              </div>
            </header>

            {/* Loading progress bar container - fixed height to prevent CLS */}
            <div
              className="relative h-[2px] w-full shrink-0 overflow-hidden bg-border/10"
              data-testid="refresh-progress-bar"
            >
              {isValidating && (
                <div className="animate-shimmer absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-transparent via-primary to-transparent" />
              )}
            </div>

            {/* Signed out: the account is the only thing missing, so say that once, here, in place
                of the whole GitHub-backed apparatus below (KPIs, global filters, remote tabs). One
                closable strip rather than a centred empty state — the WIP tab underneath is local
                and still full, and this way the guidance costs a single row of it, or none once
                it has been read. */}
            {showConnectBanner && (
              <ConnectGithubBanner
                onOpenSettings={onOpenSettings}
                onDismiss={dismissConnectBanner}
              />
            )}

            {/* Overview KPI Bar — every figure in it is the connected account's. */}
            {githubConnected && (
              <LaunchpadKpiBar
                openPRsCount={openPRsCount}
                needsReviewCount={needsReviewCount}
                openIssuesCount={openIssuesCount}
                ciPassRate={ciPassRate}
                weekCommits={weekCommits}
                loading={loading}
              />
            )}

            {/* Global controls shared across every inner tab (search + collapse/expand all) —
                every list they act on is GitHub's, save the WIP one, which carries its own. */}
            {githubConnected && <LaunchpadToolbar />}

            {/* Inner Tab Bar */}
            <div className="flex shrink-0 items-center border-b border-border bg-card/30 px-3">
              {PR_TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <InnerTab
                    key={tab.id}
                    data-testid={`launchpad-tab-${tab.id}`}
                    active={visibleTab === tab.id}
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
            <div className="min-h-0 flex-1">{renderActiveTab(PR_TABS, visibleTab)}</div>
          </div>
          {openedPr && <PrSidePanel pr={openedPr} onClose={() => setOpenedPr(null)} />}
          {openedIssue && (
            <IssueSidePanel
              issue={openedIssue}
              onClose={() => setOpenedIssue(null)}
              onChanged={refreshIssues}
            />
          )}
        </div>
      </OpenIssueContext.Provider>
    </OpenPrContext.Provider>
  )
}
