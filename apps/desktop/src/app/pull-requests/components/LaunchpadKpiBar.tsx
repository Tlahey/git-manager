import { GitPullRequest, Eye, AlertCircle, CheckCircle2, GitCommit } from 'lucide-react'
import { KpiCard } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'

export interface LaunchpadKpiBarProps {
  openPRsCount: number
  needsReviewCount: number
  openIssuesCount: number
  /** Percentage, already rounded. */
  ciPassRate: number
  weekCommits: number
  loading: boolean
}

/**
 * The Launchpad's five overview figures. Extracted out of `PullRequestsPage` when the whole bar
 * became conditional on a connected GitHub account — every figure it shows is that account's, so
 * signing out takes the row with it, and a five-card block inlined in a conditional is exactly the
 * shape the repo's "1 feature = 1 component" rule exists to prevent.
 */
export function LaunchpadKpiBar({
  openPRsCount,
  needsReviewCount,
  openIssuesCount,
  ciPassRate,
  weekCommits,
  loading,
}: LaunchpadKpiBarProps) {
  const { t } = useTranslation('launchpad')

  return (
    <div
      className="flex shrink-0 items-stretch gap-3 border-b border-border bg-card/20 px-5 py-3"
      data-testid="launchpad-kpi-bar"
    >
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
  )
}
