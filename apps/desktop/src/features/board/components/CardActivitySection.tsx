import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner, cn } from '@git-manager/ui'
import type { BoardColumn, BoardComment, BoardTag, CardHistoryEntry } from '@git-manager/git-types'
import { AttachmentTextarea } from './AttachmentTextarea'
import { CardContentSection } from './CardContentSection'
import { CardActivityCommentRow } from './CardActivityCommentRow'
import { CardActivityHistoryRow } from './CardActivityHistoryRow'
import { buildActivityTimeline } from '../lib/cardActivityTimeline'

type ActivityTab = 'all' | 'comments' | 'history'
const TABS: ActivityTab[] = ['all', 'comments', 'history']

interface CardActivitySectionProps {
  comments: BoardComment[]
  commentsLoading?: boolean
  onSubmit: (body: string) => Promise<unknown>
  repoPath: string
  attachmentUrlPrefix?: string
  disabled?: boolean
  /** The card's git-derived history — `undefined` for a remote (GitHub-backed) card, which has no
   * ref to walk. Comments-only mode then drops the tab bar entirely rather than showing a "History"
   * tab that can never hold anything: that would read as "no changes yet" rather than "unsupported". */
  history?: CardHistoryEntry[]
  historyLoading?: boolean
  columns: BoardColumn[]
  tags: BoardTag[]
}

/**
 * The card's activity feed — comments and git-derived history in one timeline, tabbed the way
 * Jira's own Activity panel is (All / Comments / History), rather than as two separate collapsible
 * sections. "All" interleaves both by real time; "Comments" and "History" are the same timeline
 * filtered down to one kind.
 */
export function CardActivitySection({
  comments,
  commentsLoading,
  onSubmit,
  repoPath,
  attachmentUrlPrefix,
  disabled,
  history,
  historyLoading,
  columns,
  tags,
}: CardActivitySectionProps) {
  const { t } = useTranslation('board')
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [tab, setTab] = useState<ActivityTab>('all')

  const hasHistory = history !== undefined
  const timeline = buildActivityTimeline(comments, history ?? [])
  const activeTab: ActivityTab = hasHistory ? tab : 'comments'
  const items = timeline.filter((item) => {
    if (activeTab === 'all') return true
    return activeTab === 'comments' ? item.type === 'comment' : item.type === 'history'
  })
  const loading =
    activeTab === 'history'
      ? historyLoading
      : activeTab === 'comments'
        ? commentsLoading
        : commentsLoading || historyLoading

  async function submit() {
    if (!draft.trim() || pending) return
    setPending(true)
    try {
      await onSubmit(draft.trim())
      setDraft('')
    } catch {
      // Reported by the action layer (`reportWriteFailures`); swallowed here so the rejection isn't
      // an unhandled one, and so the dialog stays open on what the user typed.
    } finally {
      setPending(false)
    }
  }

  const emptyLabel =
    activeTab === 'history'
      ? t('card.history.empty')
      : activeTab === 'comments'
        ? t('card.comments.empty')
        : t('card.activity.empty.all')
  const loadingLabel =
    activeTab === 'history'
      ? t('card.history.loading')
      : activeTab === 'comments'
        ? t('card.comments.loading')
        : t('card.activity.loading.all')

  return (
    <CardContentSection
      title={t('card.activity.label')}
      sectionKey="card-activity"
      testId="card-activity-section"
      aside={
        timeline.length > 0 ? (
          <span className="text-[11px] font-medium text-foreground">{timeline.length}</span>
        ) : undefined
      }
    >
      {hasHistory && (
        <div role="tablist" className="mb-2 flex gap-3 border-b border-border/60 text-[11px]">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              data-testid={`card-activity-tab-${key}`}
              onClick={() => setTab(key)}
              className={cn(
                '-mb-px cursor-pointer border-b-2 px-0.5 pb-1.5 font-medium transition-colors',
                tab === key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {key === 'all'
                ? t('card.activity.tabs.all')
                : key === 'comments'
                  ? t('card.comments.label')
                  : t('card.history.label')}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Spinner className="h-3 w-3" /> {loadingLabel}
          </p>
        ) : items.length === 0 ? (
          <p className="text-[11px] text-muted-foreground" data-testid="card-activity-empty">
            {emptyLabel}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) =>
              item.type === 'comment' ? (
                <CardActivityCommentRow
                  key={`comment-${item.comment.id}`}
                  comment={item.comment}
                  repoPath={repoPath}
                />
              ) : (
                <CardActivityHistoryRow
                  key={`history-${item.entry.oid}`}
                  entry={item.entry}
                  columns={columns}
                  tags={tags}
                />
              )
            )}
          </ul>
        )}

        {activeTab !== 'history' && (
          <>
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
          </>
        )}
      </div>
    </CardContentSection>
  )
}
