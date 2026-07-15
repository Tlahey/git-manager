import { useState, type ReactNode } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import {
  Check,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Circle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { GhRawPR, PrMergeability } from '../../../api/github.api'
import { usePrActions } from '../../../hooks/usePrActions'
import { summarizeChecks, groupChecks, type ChecksSummaryKind } from './prChecks'
import { PrCheckRow } from './PrCheckRow'

interface PrChecksBoxProps {
  repoPath: string
  prNumber: number
  pr: GhRawPR
  mergeability: PrMergeability | undefined
  isLoading: boolean
}

/** One status line in the merge box: an icon, a title, an optional subtitle, and an optional
 * right-side action or expand toggle. */
function Row({
  icon,
  title,
  subtitle,
  action,
  testId,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-center gap-2.5 border-t border-border px-4 py-2.5 first:border-t-0"
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{title}</p>
        {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/**
 * GitHub-style merge box: the review verdict, the checks rollup (grouped + expandable, with per-check
 * "Required" badges), an out-of-date row with an Update-branch action, and a blocked/conflicts row.
 * Data comes from {@link usePrMergeability} (GraphQL) so it matches what github.com shows.
 */
export function PrChecksBox({ repoPath, prNumber, pr, mergeability, isLoading }: PrChecksBoxProps) {
  const { t } = useTranslation('git')
  const { updateBranch, pending } = usePrActions(repoPath, prNumber)
  const checks = mergeability?.checks ?? []
  const summary = summarizeChecks(checks)
  const [expanded, setExpanded] = useState(summary.kind === 'failure' || summary.kind === 'in_progress')

  if (isLoading && !mergeability) {
    return (
      <div className="flex items-center gap-2 px-4 py-3">
        <Spinner className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{t('pr.ci.running')}</span>
      </div>
    )
  }

  const reviewRow = renderReviewRow()
  const checksSubtitle = buildChecksSubtitle()
  const groups = groupChecks(checks)

  return (
    <div data-testid="pr-checks-box">
      {reviewRow}

      {summary.kind !== 'none' && (
        <>
          <Row
            testId="pr-checks-summary"
            icon={checksSummaryIcon(summary.kind)}
            title={t(checksSummaryTitle(summary.kind))}
            subtitle={checksSubtitle}
            action={
              <button
                onClick={() => setExpanded((v) => !v)}
                data-testid="pr-checks-toggle"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t('pr.checks.toggle')}
              >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            }
          />
          {expanded &&
            groups.map((g) => (
              <div key={g.category} className="border-t border-border bg-muted/30">
                <p className="px-4 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t(`pr.checks.group.${g.category}`, { count: g.checks.length })}
                </p>
                <ul className="pb-1">
                  {g.checks.map((c) => (
                    <PrCheckRow key={`${c.name}-${c.category}`} check={c} />
                  ))}
                </ul>
              </div>
            ))}
        </>
      )}

      {mergeability?.mergeStateStatus === 'BEHIND' && (
        <Row
          testId="pr-checks-behind"
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          title={t('pr.checks.behind.title')}
          subtitle={t('pr.checks.behind.subtitle', { base: pr.base?.ref ?? 'base' })}
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              disabled={pending}
              onClick={() => updateBranch()}
              data-testid="pr-update-branch"
            >
              {pending && <Spinner className="h-3 w-3" />}
              {t('pr.checks.updateBranch')}
            </Button>
          }
        />
      )}

      {mergeability?.mergeStateStatus === 'BLOCKED' && (
        <Row
          testId="pr-checks-blocked"
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          title={t('pr.checks.blocked.title')}
          subtitle={t('pr.checks.blocked.subtitle')}
        />
      )}

      {mergeability?.mergeStateStatus === 'DIRTY' && (
        <Row
          testId="pr-checks-conflicts"
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          title={t('pr.checks.conflicts.title')}
          subtitle={t('pr.checks.conflicts.subtitle')}
        />
      )}
    </div>
  )

  function renderReviewRow() {
    const decision = mergeability?.reviewDecision
    if (!decision) return null
    const pendingCount = pr.requested_reviewers?.length ?? 0
    const pendingSub =
      pendingCount > 0 ? t('pr.checks.review.pending', { count: pendingCount }) : undefined

    if (decision === 'APPROVED') {
      return (
        <Row
          testId="pr-checks-review"
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          title={t('pr.checks.review.approved')}
        />
      )
    }
    if (decision === 'CHANGES_REQUESTED') {
      return (
        <Row
          testId="pr-checks-review"
          icon={<XCircle className="h-4 w-4 text-destructive" />}
          title={t('pr.checks.review.changesRequested')}
          subtitle={pendingSub}
        />
      )
    }
    return (
      <Row
        testId="pr-checks-review"
        icon={<XCircle className="h-4 w-4 text-destructive" />}
        title={t('pr.checks.review.required')}
        subtitle={pendingSub}
      />
    )
  }

  function buildChecksSubtitle(): string {
    const { counts } = summary
    const parts: string[] = []
    if (counts.failure > 0) parts.push(t('pr.checks.count.failing', { count: counts.failure }))
    if (counts.in_progress > 0)
      parts.push(t('pr.checks.count.inProgress', { count: counts.in_progress }))
    if (counts.skipped > 0) parts.push(t('pr.checks.count.skipped', { count: counts.skipped }))
    if (counts.success > 0) parts.push(t('pr.checks.count.successful', { count: counts.success }))
    if (counts.neutral > 0) parts.push(t('pr.checks.count.neutral', { count: counts.neutral }))
    return parts.join(', ')
  }
}

function checksSummaryIcon(kind: ChecksSummaryKind): ReactNode {
  switch (kind) {
    case 'success':
      return <Check className="h-4 w-4 text-green-500" />
    case 'failure':
      return <XCircle className="h-4 w-4 text-destructive" />
    case 'in_progress':
      return <Spinner className="h-4 w-4 text-amber-500" />
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" />
  }
}

function checksSummaryTitle(kind: ChecksSummaryKind): string {
  switch (kind) {
    case 'success':
      return 'pr.checks.summary.success'
    case 'failure':
      return 'pr.checks.summary.failure'
    case 'in_progress':
      return 'pr.checks.summary.inProgress'
    default:
      return 'pr.checks.summary.none'
  }
}
