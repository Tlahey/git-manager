import {
  ArrowRight,
  Check,
  CircleDot,
  Clock,
  MessageSquare,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { Avatar, Spinner } from '@git-manager/ui'
import type { PullRequest } from '@git-manager/git-types'
import { useTranslation } from '@git-manager/i18n'
import type { PrReviewSummary, PrReviewer } from '../../../api/github.api'
import { formatExactDate, formatRelativeTime } from '../../../lib/relativeDate'
import { derivePrTagStatus, PR_STATE_LABEL_KEY } from '../../../components/common/prTagStatus'

interface PrHoverCardProps {
  pr: PullRequest
  summary: PrReviewSummary | undefined
  isLoading: boolean
}

const REVIEWER_STATE_STYLES: Record<
  PrReviewer['state'],
  { Icon: typeof Check; className: string; labelKey: string }
> = {
  APPROVED: {
    Icon: Check,
    className: 'text-green-400',
    labelKey: 'sidebar.prCard.review.approved',
  },
  CHANGES_REQUESTED: {
    Icon: X,
    className: 'text-red-400',
    labelKey: 'sidebar.prCard.review.changesRequested',
  },
  COMMENTED: {
    Icon: MessageSquare,
    className: 'text-muted-foreground',
    labelKey: 'sidebar.prCard.review.commented',
  },
  PENDING: {
    Icon: Clock,
    className: 'text-amber-400',
    labelKey: 'sidebar.prCard.review.pending',
  },
}

const CHECKS_STYLES: Record<string, { Icon: typeof Check; className: string; labelKey: string }> = {
  SUCCESS: {
    Icon: CheckCircle2,
    className: 'text-green-400',
    labelKey: 'sidebar.prCard.checks.success',
  },
  FAILURE: { Icon: XCircle, className: 'text-red-400', labelKey: 'sidebar.prCard.checks.failure' },
  ERROR: { Icon: XCircle, className: 'text-red-400', labelKey: 'sidebar.prCard.checks.failure' },
  PENDING: {
    Icon: Loader2,
    className: 'text-amber-400',
    labelKey: 'sidebar.prCard.checks.pending',
  },
  EXPECTED: {
    Icon: Loader2,
    className: 'text-amber-400',
    labelKey: 'sidebar.prCard.checks.pending',
  },
}

/**
 * Epoch seconds for an ISO timestamp, or `null` when GitHub sent nothing usable.
 *
 * The date helpers below take epoch seconds and would happily format `NaN` into a nonsense date, so
 * an unparseable value drops its whole line rather than showing "Invalid Date".
 */
function epochSeconds(iso: string | undefined): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? null : ms / 1000
}

/** One "<label>  <absolute date> (<relative>)" line of the card's timeline. */
function TimelineRow({
  label,
  seconds,
  locale,
  testId,
}: {
  label: string
  seconds: number | null
  locale: string
  testId: string
}) {
  if (seconds === null) return null

  return (
    <div className="flex items-baseline gap-1.5 text-[10px]" data-testid={testId}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-foreground">{formatExactDate(seconds, locale)}</span>
      <span className="text-muted-foreground">({formatRelativeTime(seconds, locale)})</span>
    </div>
  )
}

const REVIEW_DECISION_LABEL_KEY: Record<string, string> = {
  APPROVED: 'sidebar.prCard.decision.approved',
  CHANGES_REQUESTED: 'sidebar.prCard.decision.changesRequested',
  REVIEW_REQUIRED: 'sidebar.prCard.decision.reviewRequired',
}

/**
 * The preview shown when the pointer rests on a pull request row: its title, the branches it would
 * merge, and the reviewer/approval/checks state.
 *
 * Rendered as the `content` of the shared {@link Tooltip} primitive rather than as its own floating
 * element, so it inherits that component's portal, viewport-edge flipping, focus/Escape handling
 * and `aria-describedby` wiring for free. The review data arrives from a lazy hook, so the card
 * shows the parts it already has (title, branches, author) while the rest is still in flight.
 */
export function PrHoverCard({ pr, summary, isLoading }: PrHoverCardProps) {
  const { t, i18n } = useTranslation('git')
  const locale = i18n.language
  const status = derivePrTagStatus(pr)
  const checks = summary?.checksState ? CHECKS_STYLES[summary.checksState] : undefined

  // Both trailing blocks carry a top border, so each has to know whether it has anything to show
  // before it renders: an empty one is a rule across the bottom of the card separating nothing from
  // nothing. The review block empties out whenever its lookup is off — no repo path, no token, or a
  // failed request — which is a routine state, not an edge case.
  const openedAt = epochSeconds(pr.createdAt)
  const updatedAt = epochSeconds(pr.updatedAt)
  const hasTimeline = openedAt !== null || updatedAt !== null
  const hasReview = isLoading || !!summary

  return (
    <div className="w-72 whitespace-normal" data-testid={`pr-hover-card-${pr.number}`}>
      <div className="text-xs leading-snug font-semibold text-foreground">
        <span className="font-mono text-muted-foreground">#{pr.number}</span> {pr.title}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-medium">{t(PR_STATE_LABEL_KEY[status])}</span>
        <span aria-hidden>·</span>
        <span>{pr.author}</span>
      </div>

      {/* Merge target — the question a PR row can't answer on its own. */}
      <div className="mt-2 flex items-center gap-1 font-mono text-[10px]">
        <span className="max-w-[45%] truncate rounded bg-muted px-1 py-px text-foreground">
          {pr.headRef}
        </span>
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="max-w-[45%] truncate rounded bg-muted px-1 py-px text-foreground">
          {pr.baseRef}
        </span>
      </div>

      {/* When it was opened, and when it last moved — both as an absolute date with the elapsed
          time beside it, since "is this stale?" and "which one was this again?" are different
          questions and the answer to each is useless in the other's form. */}
      {hasTimeline && (
        <div className="mt-2 space-y-0.5 border-t border-border pt-2">
          <TimelineRow
            label={t('sidebar.prCard.opened')}
            seconds={openedAt}
            locale={locale}
            testId="pr-hover-card-opened"
          />
          <TimelineRow
            label={t('sidebar.prCard.updated')}
            seconds={updatedAt}
            locale={locale}
            testId="pr-hover-card-updated"
          />
        </div>
      )}

      {hasReview && (
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          {isLoading && !summary ? (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Spinner className="h-3 w-3" />
              {t('sidebar.prCard.loading')}
            </div>
          ) : (
            <>
              {summary?.reviewDecision && (
                <div className="flex items-center gap-1.5 text-[10px]">
                  <CircleDot className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('sidebar.prCard.decisionLabel')}</span>
                  <span className="font-medium text-foreground">
                    {t(REVIEW_DECISION_LABEL_KEY[summary.reviewDecision] ?? summary.reviewDecision)}
                  </span>
                </div>
              )}

              {checks && (
                <div className="flex items-center gap-1.5 text-[10px]">
                  <checks.Icon className={`h-3 w-3 shrink-0 ${checks.className}`} />
                  <span className="text-muted-foreground">{t('sidebar.prCard.checksLabel')}</span>
                  <span className={`font-medium ${checks.className}`}>{t(checks.labelKey)}</span>
                </div>
              )}

              {summary && summary.reviewers.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground">
                    {t('sidebar.prCard.reviewers')}
                  </div>
                  {summary.reviewers.map((reviewer) => {
                    const style = REVIEWER_STATE_STYLES[reviewer.state]
                    return (
                      <div key={reviewer.login} className="flex items-center gap-1.5 text-[10px]">
                        <Avatar
                          src={reviewer.avatarUrl}
                          alt={reviewer.login}
                          size={14}
                          fallback={reviewer.login.charAt(0).toUpperCase()}
                          className="bg-muted text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {reviewer.login}
                        </span>
                        <style.Icon className={`h-3 w-3 shrink-0 ${style.className}`} />
                        <span className={style.className}>{t(style.labelKey)}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                summary && (
                  <div className="text-[10px] text-muted-foreground">
                    {t('sidebar.prCard.noReviewers')}
                  </div>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
