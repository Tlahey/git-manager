import { Avatar } from '@git-manager/ui'
import type { BoardComment } from '@git-manager/git-types'
import { MarkdownRenderer } from '../../../components/markdown/MarkdownRenderer'

interface CardActivityCommentRowProps {
  comment: BoardComment
  repoPath: string
}

function formatCommentDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * One row of the activity feed's "All"/"Comments" view — a card's discussion is append-only, so
 * there is no edit or delete affordance here, matching `EditCardDialog`'s rule that a card patch
 * must never be able to rewrite what someone else wrote.
 */
export function CardActivityCommentRow({ comment, repoPath }: CardActivityCommentRowProps) {
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
      </div>
      <MarkdownRenderer content={comment.body} repoPath={repoPath} authored />
    </li>
  )
}
