import { useTranslation } from '@git-manager/i18n'
import { Badge, Spinner } from '@git-manager/ui'
import { RefreshCw } from 'lucide-react'
import { Markdown } from '../../Markdown'
import { usePrComments } from '../../../hooks/usePrComments'
import type { PrReviewState } from '../../../api/github.api'

interface PrCommentsProps {
  repoPath: string
  prNumber: number
  /** Fold the PR's submitted reviews into the timeline — see {@link usePrComments}. Off for issues,
   * which have no reviews. */
  withReviews?: boolean
}

/** i18n key per review verdict, resolved at render time — a module-level map can't call `t()`. */
const REVIEW_STATE_LABELS: Record<PrReviewState, string> = {
  APPROVED: 'pr.comments.review.approved',
  CHANGES_REQUESTED: 'pr.comments.review.changesRequested',
  COMMENTED: 'pr.comments.review.commented',
  DISMISSED: 'pr.comments.review.dismissed',
  PENDING: 'pr.comments.review.pending',
}

const REVIEW_STATE_VARIANTS: Record<PrReviewState, 'success' | 'destructive' | 'secondary'> = {
  APPROVED: 'success',
  CHANGES_REQUESTED: 'destructive',
  COMMENTED: 'secondary',
  DISMISSED: 'secondary',
  PENDING: 'secondary',
}

/** The PR conversation: a caption label with a refresh button and one card per entry — issue
 * comments and, when `withReviews` is set, the body of every submitted review (avatar, author, date,
 * verdict badge, markdown body). Read-only here — posting lives in {@link PrCommentBox}. */
export function PrComments({ repoPath, prNumber, withReviews = false }: PrCommentsProps) {
  const { t, i18n } = useTranslation('git')
  const { comments, isLoading, refresh } = usePrComments(repoPath, prNumber, { withReviews })

  return (
    <section data-testid="pr-comments" className="border-t border-border px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {t('pr.comments.title')} {comments.length > 0 && `(${comments.length})`}
        </span>
        <button
          onClick={refresh}
          data-testid="pr-comments-refresh"
          className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t('pr.comments.refresh')}
          aria-label={t('pr.comments.refresh')}
        >
          {isLoading ? <Spinner className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
          {t('pr.comments.refresh')}
        </button>
      </div>

      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{t('pr.comments.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.key}
              data-testid={`pr-comment-${c.key}`}
              className="rounded-md border border-border bg-card p-2.5"
            >
              <div className="mb-1.5 flex items-center gap-2">
                {c.user?.avatar_url && (
                  <img
                    src={c.user.avatar_url}
                    alt={c.user.login}
                    className="h-4 w-4 rounded-full"
                  />
                )}
                <span className="text-[11px] font-medium text-foreground">
                  {c.user?.login ?? '—'}
                </span>
                {c.reviewState && (
                  <Badge
                    variant={REVIEW_STATE_VARIANTS[c.reviewState]}
                    className="px-1.5 py-0 text-[10px]"
                    data-testid={`pr-comment-review-state-${c.key}`}
                  >
                    {t(REVIEW_STATE_LABELS[c.reviewState])}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString(i18n.language)}
                </span>
              </div>
              <div className="text-xs">
                <Markdown content={c.body} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
