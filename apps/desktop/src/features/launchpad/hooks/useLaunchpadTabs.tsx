import {
  GitPullRequest,
  FolderGit2,
  BookOpen,
  AlertCircle,
  Eye,
  BellOff,
  BarChart2,
  Sliders,
} from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { defineTabs, type TabDef } from '../../../lib/navigation/tabRegistry'
import { PullRequestsTab } from '../components/PullRequestsTab'
import { WipTab } from '../components/WipTab'
import { FollowedPRsTab } from '../components/FollowedPRsTab'
import { IssuesTab } from '../components/IssuesTab'
import { WaitingForReviewTab } from '../components/WaitingForReviewTab'
import { SnoozedPRsTab } from '../components/SnoozedPRsTab'
import { CommitStatsTab } from '../components/CommitStatsTab'
import { CustomViewsTab } from '../components/CustomViewsTab'
import type { usePullRequestsPage } from './usePullRequestsPage'
import type { InnerTab } from '../lib/launchpadTypes'

/**
 * The Launchpad's eight inner tabs: what each is called, what icon it wears, and what it renders.
 *
 * Every tab takes a different prop shape, so this is a list of thunks rather than a uniform
 * component map (see `tabRegistry.ts`). It takes the page's whole state object instead of fourteen
 * separate arguments because that is what it is — the page's data, arranged into tabs — and adding
 * a tab should not mean threading one more prop through the page.
 *
 * Which of them are *reachable* is not decided here: signing out removes the GitHub-backed ones,
 * and that rule lives in `lib/githubTabs.config.ts` beside the one that resolves the persisted
 * active tab against what is left.
 */
export function useLaunchpadTabs(page: ReturnType<typeof usePullRequestsPage>): TabDef<InnerTab>[] {
  const { t } = useTranslation('launchpad')
  const {
    visiblePRs,
    snoozedPRs,
    issues,
    issuesLoading,
    refreshIssues,
    commitDays,
    yearDays,
    loading,
    username,
    pinnedIds,
    togglePin,
    followedPRs,
    addFollowed,
    removeFollowed,
  } = page

  return defineTabs<InnerTab>([
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
}
