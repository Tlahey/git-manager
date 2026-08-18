import { useTranslation } from '@git-manager/i18n'
import { Avatar, Button } from '@git-manager/ui'
import type { BoardComment } from '@git-manager/git-types'
import { MarkdownRenderer } from '../../../components/markdown/MarkdownRenderer'

interface CardActivityCommentRowProps {
  comment: BoardComment
  repoPath: string
  /** Present only in the "Comments" tab, and only when the card's comments support replies
   * (`CardActivitySection`'s `repliesEnabled`) — undefined hides the affordance entirely. */
  onReply?: () => void
  /** Present only in the "All" tab, for a reply — the author of the comment this one replies to,
   * rendered as a small "↳ replying to @author" annotation rather than visual nesting (nesting is
   * reserved for the Comments tab's `commentThreads.ts`, since the "All" tab interleaves comments
   * with unrelated history rows that a nested thread would sit awkwardly between). */
  replyingToAuthor?: string
}

function formatCommentDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * One row of the activity feed's "All"/"Comments" view — a card's discussion is append-only, so
 * there is no edit or delete affordance here, matching `EditCardDialog`'s rule that a card patch
 * must never be able to rewrite what someone else wrote. The reply action is the one exception,
 * and it's additive rather than a mutation: it never touches another comment's `body`/`author`.
 */
export function CardActivityCommentRow({
  comment,
  repoPath,
  onReply,
  replyingToAuthor,
}: CardActivityCommentRowProps) {
  const { t } = useTranslation('board')
  return (
    <li
      className="rounded border border-border/60 bg-background px-2 py-1.5"
      data-testid={`card-comment-${comment.id}`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Avatar
          alt={comment.author}
          fallback={comment.author.slice(0, 1).toUpperCase()}
          className="h-4 w-4 text-[8px]"
        />
        <span className="font-medium text-foreground">{comment.author}</span>
        <span>{formatCommentDate(comment.createdAt)}</span>
        {onReply && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-5 px-1.5 text-[10px]"
            onClick={onReply}
            data-testid={`card-comment-reply-${comment.id}`}
          >
            {t('card.comments.reply')}
          </Button>
        )}
      </div>
      {replyingToAuthor && (
        <p className="mb-1 text-[10px] text-muted-foreground">
          {t('card.comments.replyPointer', { author: replyingToAuthor })}
        </p>
      )}
      <MarkdownRenderer content={comment.body} repoPath={repoPath} authored />
    </li>
  )
}
