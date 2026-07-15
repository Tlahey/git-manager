import { useTranslation } from '@git-manager/i18n'
import { Spinner } from '@git-manager/ui'
import { RefreshCw } from 'lucide-react'
import { Markdown } from '../../Markdown'
import { usePrComments } from '../../../hooks/usePrComments'

interface PrCommentsProps {
  repoPath: string
  prNumber: number
}

/** The PR conversation: a caption label with a refresh button and one card per issue comment
 * (avatar, author, date, markdown body). Read-only here — posting lives in {@link PrCommentBox}. */
export function PrComments({ repoPath, prNumber }: PrCommentsProps) {
  const { t } = useTranslation('git')
  const { comments, isLoading, refresh } = usePrComments(repoPath, prNumber)

  return (
    <section data-testid="pr-comments" className="border-t border-border px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('pr.comments.title')} {comments.length > 0 && `(${comments.length})`}
        </span>
        <button
          onClick={refresh}
          data-testid="pr-comments-refresh"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t('pr.comments.refresh')}
        >
          {isLoading ? <Spinner className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
          {t('pr.comments.refresh')}
        </button>
      </div>

      {comments.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">{t('pr.comments.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              data-testid={`pr-comment-${c.id}`}
              className="rounded-md border border-border bg-card p-2.5"
            >
              <div className="mb-1.5 flex items-center gap-2">
                {c.user?.avatar_url && (
                  <img src={c.user.avatar_url} alt={c.user.login} className="h-4 w-4 rounded-full" />
                )}
                <span className="text-[11px] font-medium text-foreground">{c.user?.login ?? '—'}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString()}
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
