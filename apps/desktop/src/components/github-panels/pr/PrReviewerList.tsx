import { useTranslation } from '@git-manager/i18n'
import { Avatar } from '@git-manager/ui'
import type { PrReviewer } from '../../../api/github.api'
import { REVIEWER_STATE_STYLES } from '../../common/reviewerState.config'

interface PrReviewerListProps {
  reviewers: PrReviewer[]
  /** Shown when the PR has no reviewer at all — neither a review nor a pending request. */
  emptyLabel: string
}

/**
 * The PR panel's reviewers, each with the verdict they left (approved / changes requested /
 * commented) or the fact that theirs is still awaited.
 *
 * Deliberately not {@link PrUserList}: a reviewer is not just a user on the PR. The REST payload's
 * `requested_reviewers` — which a plain user list is all that could show — holds only the people
 * whose review is *still pending*, because GitHub drops a reviewer from it the moment they submit
 * one. Rendering that list alone made the section go blank exactly when the PR had reviews, so the
 * data comes from `fetchPrReviewSummary`, which merges the submitted reviews with the outstanding
 * requests.
 */
export function PrReviewerList({ reviewers, emptyLabel }: PrReviewerListProps) {
  const { t } = useTranslation('git')

  if (reviewers.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{t(emptyLabel)}</p>
  }

  return (
    <ul className="space-y-1">
      {reviewers.map((reviewer) => {
        const style = REVIEWER_STATE_STYLES[reviewer.state]
        return (
          <li
            key={reviewer.login}
            data-testid={`pr-reviewer-${reviewer.login}`}
            className="flex items-center gap-1.5 text-xs"
          >
            <Avatar
              src={reviewer.avatarUrl}
              alt={reviewer.login}
              size={16}
              fallback={reviewer.login.charAt(0).toUpperCase()}
              className="bg-muted text-muted-foreground"
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{reviewer.login}</span>
            <style.Icon className={`h-3 w-3 shrink-0 ${style.className}`} />
            <span className={style.className}>{t(style.labelKey)}</span>
          </li>
        )
      })}
    </ul>
  )
}
