import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Avatar, Button, Label, Spinner } from '@git-manager/ui'
import { MessageSquare } from 'lucide-react'
import type { BoardComment } from '@git-manager/git-types'
import { MarkdownRenderer } from '../../../components/markdown/MarkdownRenderer'
import { AttachmentTextarea } from './AttachmentTextarea'

interface CardCommentsSectionProps {
  comments: BoardComment[]
  loading?: boolean
  onSubmit: (body: string) => Promise<unknown>
  repoPath: string
  attachmentUrlPrefix?: string
  disabled?: boolean
}

function formatCommentDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * The card's discussion.
 *
 * Comments are append-only, which is why there is no edit or delete here and why the backend takes
 * them through their own call rather than as part of a card patch: editing a card must not be able
 * to rewrite what someone else wrote. Authorship is decided by the backend too — the repository's
 * git user locally, the GitHub account remotely — never sent from this component.
 */
export function CardCommentsSection({
  comments,
  loading,
  onSubmit,
  repoPath,
  attachmentUrlPrefix,
  disabled,
}: CardCommentsSectionProps) {
  const { t } = useTranslation('board')
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)

  async function submit() {
    if (!draft.trim() || pending) return
    setPending(true)
    try {
      await onSubmit(draft.trim())
      setDraft('')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-2" data-testid="card-comments-section">
      <Label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <MessageSquare className="h-3 w-3" />
        {t('card.comments.label')}
        {comments.length > 0 && (
          <span className="font-medium text-foreground">{comments.length}</span>
        )}
      </Label>

      {loading ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Spinner className="h-3 w-3" /> {t('card.comments.loading')}
        </p>
      ) : comments.length === 0 ? (
        <p className="text-[11px] text-muted-foreground" data-testid="card-comments-empty">
          {t('card.comments.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
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
          ))}
        </ul>
      )}

      <AttachmentTextarea
        value={draft}
        onChange={setDraft}
        repoPath={repoPath}
        attachmentUrlPrefix={attachmentUrlPrefix}
        placeholder={t('card.comments.placeholder')}
        rows={3}
        disabled={disabled || pending}
        className="text-xs"
        data-testid="card-comment-input"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={disabled || pending || !draft.trim()}
          onClick={() => void submit()}
          data-testid="card-comment-submit"
        >
          {pending && <Spinner className="h-3 w-3" />}
          {t('card.comments.submit')}
        </Button>
      </div>
    </div>
  )
}
