import { useTranslation } from '@git-manager/i18n'
import { Button, Tooltip } from '@git-manager/ui'
import { History, Trash2 } from 'lucide-react'
import type { StoredSearchRun } from '../../../stores/aiCommitSearch.store'
import { formatRelativeTime } from '../../../lib/relativeDate'

interface CommitSearchHistoryListProps {
  runs: StoredSearchRun[]
  /** The run currently being displayed, so the list can mark it. */
  activeRunId: string | null
  onOpen: (run: StoredSearchRun) => void
  onRemove: (id: string) => void
  onClearAll: () => void
}

/**
 * Every search this repository has been asked, newest first.
 *
 * A search costs one model call per commit, so re-asking a question already asked is minutes of
 * local model time spent reproducing an answer that was already read. Keeping them is also what
 * makes the feature inspectable after the fact: each entry says what was asked, how much history was
 * actually read and by which model, and reopening one restores the answer *and* its commits.
 */
export function CommitSearchHistoryList({
  runs,
  activeRunId,
  onOpen,
  onRemove,
  onClearAll,
}: CommitSearchHistoryListProps) {
  const { t, i18n } = useTranslation('git')

  return (
    <div className="flex flex-col gap-1.5" data-testid="commit-search-history">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <History className="h-3 w-3" />
          {t('gitTree.commitSearch.historyTitle')}
        </h4>
        {runs.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={onClearAll}
            data-testid="commit-search-history-clear"
          >
            {t('gitTree.commitSearch.historyClear')}
          </Button>
        )}
      </div>

      {runs.length === 0 ? (
        <p className="text-[10px] text-muted-foreground" data-testid="commit-search-history-empty">
          {t('gitTree.commitSearch.historyEmpty')}
        </p>
      ) : (
        runs.map((run) => (
          <div
            key={run.id}
            className={`flex items-start gap-1 rounded-md border px-2 py-1.5 transition-colors ${
              run.id === activeRunId
                ? 'border-primary/60 bg-accent'
                : 'border-border bg-muted/20 hover:bg-accent'
            }`}
            data-testid={`commit-search-history-${run.id}`}
          >
            <button
              type="button"
              onClick={() => onOpen(run)}
              className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-left"
            >
              <span className="truncate text-xs text-foreground">{run.question}</span>
              <span className="text-[10px] text-muted-foreground">
                {t('gitTree.commitSearch.historyMeta', {
                  when: formatRelativeTime(run.ranAt / 1000, i18n.language),
                  scanned: run.scanned,
                  matches: run.matches.length,
                  model: run.model,
                })}
              </span>
            </button>
            <Tooltip content={t('gitTree.commitSearch.historyRemove')}>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onClick={() => onRemove(run.id)}
                aria-label={t('gitTree.commitSearch.historyRemove')}
                data-testid={`commit-search-history-remove-${run.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </Tooltip>
          </div>
        ))
      )}
    </div>
  )
}
