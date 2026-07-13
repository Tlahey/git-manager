import { useEffect, useRef } from 'react'
import { X, History, Dot } from 'lucide-react'
import { Button, cn, Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { FileHistoryEntry, FileHistoryStatus } from '@git-manager/git-types'
import { useFileHistory } from '../../hooks/useFileHistory'
import { useCommitAvatars } from '../../hooks/useCommitAvatars'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { CommitAvatar } from '../git-graph/components/CommitAvatar'
import { formatRelativeTime, formatExactDate } from '../../lib/relativeDate'

interface BlameHistoryPanelProps {
  file: { path: string; staged: boolean; oid?: string } | null
  repoPath: string | null
  onClose: () => void
}

/** Color + single-letter marker per change type, shown alongside each history row. */
const STATUS_STYLE: Record<FileHistoryStatus, { letter: string; className: string }> = {
  added: { letter: 'A', className: 'text-green-500' },
  modified: { letter: 'M', className: 'text-amber-500' },
  deleted: { letter: 'D', className: 'text-red-500' },
  renamed: { letter: 'R', className: 'text-blue-400' },
}

export function BlameHistoryPanel({ file, repoPath, onClose }: BlameHistoryPanelProps) {
  const { t, i18n } = useTranslation('git')

  const selectedHistoryOid = useRepoUIStore((s) => s.selectedHistoryOid)
  const setSelectedHistoryOid = useRepoUIStore((s) => s.setSelectedHistoryOid)

  const { data: history, isLoading } = useFileHistory(repoPath, file?.path ?? null)
  const avatars = useCommitAvatars(
    repoPath,
    (history ?? []).map((h) => h.oid)
  )

  const hasHistory = (history?.length ?? 0) > 0

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <History className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="select-none truncate text-xs font-semibold text-foreground">
            {t('fileHistory.title')}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 hover:bg-accent"
          onClick={onClose}
          title={t('fileHistory.close')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content: version list */}
      <div className="flex flex-1 flex-col overflow-y-auto" data-testid="file-history-list">
        {!file && (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-[11px] text-muted-foreground">
            {t('fileHistory.openFile')}
          </div>
        )}

        {file && isLoading && (
          <div className="flex flex-1 items-center justify-center p-6">
            <Spinner className="mr-2 h-4 w-4 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">{t('fileHistory.loading')}</span>
          </div>
        )}

        {file && !isLoading && !hasHistory && (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-[11px] text-muted-foreground">
            {t('fileHistory.empty')}
          </div>
        )}

        {file && !isLoading && hasHistory && (
          <ul className="flex flex-col py-1">
            {/* Current (working) version */}
            <li>
              <button
                data-testid="history-current-version"
                onClick={() => setSelectedHistoryOid(null)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50',
                  selectedHistoryOid === null && 'bg-accent'
                )}
              >
                <Dot className="h-5 w-5 shrink-0 text-green-500" />
                <span className="truncate text-[11px] font-semibold text-foreground">
                  {t('fileHistory.currentVersion')}
                </span>
              </button>
            </li>

            {(history ?? []).map((entry) => (
              <HistoryRow
                key={entry.oid}
                entry={entry}
                avatarUrl={avatars[entry.oid]}
                isSelected={selectedHistoryOid === entry.oid}
                statusLabel={t(`fileHistory.status.${entry.status}`)}
                relativeTime={formatRelativeTime(entry.timestamp, i18n.language)}
                exactTime={formatExactDate(entry.timestamp, i18n.language)}
                noMessage={t('fileHistory.noMessage')}
                onSelect={() => setSelectedHistoryOid(entry.oid)}
              />
            ))}

            {/* End-of-history marker */}
            <li
              data-testid="history-end"
              className="flex select-none items-center gap-2 px-3 py-3 text-[9px] uppercase tracking-wide text-muted-foreground/60"
            >
              <span className="h-px flex-1 bg-border/60" />
              <span>{t('fileHistory.endOfHistory')}</span>
              <span className="h-px flex-1 bg-border/60" />
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}

interface HistoryRowProps {
  entry: FileHistoryEntry
  avatarUrl?: string
  isSelected: boolean
  statusLabel: string
  relativeTime: string
  exactTime: string
  noMessage: string
  onSelect: () => void
}

function HistoryRow({
  entry,
  avatarUrl,
  isSelected,
  statusLabel,
  relativeTime,
  exactTime,
  noMessage,
  onSelect,
}: HistoryRowProps) {
  const status = STATUS_STYLE[entry.status]
  const rowRef = useRef<HTMLButtonElement>(null)

  // Scroll the row into view when it becomes selected — e.g. from clicking a blame-gutter avatar,
  // which selects a commit that may be far down the list.
  useEffect(() => {
    // `scrollIntoView` is optional-chained: jsdom doesn't implement it, and we only need it in-app.
    if (isSelected) rowRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [isSelected])

  return (
    <li>
      <button
        ref={rowRef}
        data-testid={`history-row-${entry.shortOid}`}
        onClick={onSelect}
        title={`${entry.summary}\n${entry.authorName} · ${exactTime}`}
        className={cn(
          'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50',
          isSelected && 'bg-accent'
        )}
      >
        <CommitAvatar
          avatarUrl={avatarUrl}
          name={entry.authorName || entry.authorEmail || '?'}
          size={22}
          className="mt-0.5"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span
              data-testid={`history-status-${entry.shortOid}`}
              title={statusLabel}
              className={cn('shrink-0 font-mono text-[10px] font-bold', status.className)}
            >
              {status.letter}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-foreground">
              {entry.summary || noMessage}
            </span>
            {/* Commit SHA, top-right — prominent for quick scanning */}
            <span className="shrink-0 rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
              {entry.shortOid}
            </span>
          </span>
          <span className="flex items-center gap-1.5 truncate text-[9px] text-muted-foreground">
            <span className="truncate">{entry.authorName}</span>
            <span>·</span>
            <span className="shrink-0">{relativeTime}</span>
          </span>
        </div>
      </button>
    </li>
  )
}
