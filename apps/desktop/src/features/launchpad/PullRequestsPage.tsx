import { useState, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { InnerTab } from '@git-manager/components'
import { usePullRequestsPage } from './hooks/usePullRequestsPage'
import { usePendingPrOpen } from './hooks/usePendingPrOpen'
import { useLaunchpadTabs } from './hooks/useLaunchpadTabs'
import { OpenPrContext } from './components/OpenPrContext'
import { OpenIssueContext } from './components/OpenIssueContext'
import { PrSidePanel } from './components/PrSidePanel'
import { IssueSidePanel } from './components/IssueSidePanel'
import { ConnectGithubBanner } from './components/ConnectGithubBanner'
import { LaunchpadHeader } from './components/LaunchpadHeader'
import { LaunchpadKpiBar } from './components/LaunchpadKpiBar'
import { LaunchpadToolbar } from './components/LaunchpadToolbar'
import { appEventBus } from '../../lib/appEventBus'
import { renderActiveTab } from '../../lib/navigation/tabRegistry'
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

  const page = usePullRequestsPage()
  const {
    activeTab,
    setActiveTab,
    prs,
    loading,
    isValidating,
    error,
    hasAccount,
    githubConnected,
    showConnectBanner,
    dismissConnectBanner,
    isMocked,
    username,
    lastRefreshed,
    refresh,
    refreshIssues,
    openPRsCount,
    needsReviewCount,
    openIssuesCount,
    ciPassRate,
    weekCommits,
    tabCounts,
  } = page

  // Drive the global loading overlay while the Launchpad's first data load is in flight. This also
  // holds the startup splash until the Launchpad is ready when it's the active tab (see
  // useAppReadySplash) — no token means an instant mock load, so nothing blocks in that case.
  useGlobalLoadingWhile(loading, t('page.fetching'))

  // A notification click for a PR whose repo isn't cloned locally lands here instead of on a repo
  // tab's PR page (see `lib/notifications/notificationRouting.ts`); open its panel now.
  usePendingPrOpen({ prs, loading, onOpen: setOpenedPr })

  const ALL_TABS = useLaunchpadTabs(page)

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
            <LaunchpadHeader
              hasAccount={hasAccount}
              isMocked={isMocked}
              githubConnected={githubConnected}
              loading={loading}
              isValidating={isValidating}
              error={error}
              username={username}
              lastRefreshed={lastRefreshed}
              onRefresh={refresh}
            />

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

            {/* Global controls shared across every inner tab (search + collapse/expand all). The
                search narrows every list tab on top of that tab's own box — including WIP, whose
                rows are the only local ones; it matched on repository and branch already, it just
                wasn't being handed the global query. */}
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
