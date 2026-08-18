import { useTranslation } from '@git-manager/i18n'
import type { BoardColumn, BoardTag, CardHistoryEntry } from '@git-manager/git-types'
import { describeCardFieldChange } from '../lib/cardHistoryChange'

interface CardActivityHistoryRowProps {
  entry: CardHistoryEntry
  columns: BoardColumn[]
  tags: BoardTag[]
}

function formatEntryDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

/**
 * One row of the activity feed's "All"/"History" view — a commit `card_history` found that touched
 * this card, turned into a before/after line per field (Jira's own history layout: who, when, then
 * "old value → new value" per changed field), rather than a single natural-language sentence.
 */
export function CardActivityHistoryRow({ entry, columns, tags }: CardActivityHistoryRowProps) {
  const { t } = useTranslation('board')

  return (
    <li
      className="rounded border border-border/60 bg-background px-2 py-1.5"
      data-testid={`card-history-entry-${entry.shortOid}`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground">{entry.authorName}</span>
        <span>{formatEntryDate(entry.timestamp)}</span>
      </div>
      {entry.kind === 'created' ? (
        <p className="text-[11px] text-foreground">{t('card.history.created')}</p>
      ) : entry.kind === 'deleted' ? (
        <p className="text-[11px] text-foreground">{t('card.history.deleted')}</p>
      ) : (
        <ul className="space-y-1.5">
          {entry.changes.map((change, index) => {
            const display = describeCardFieldChange(change, { t, columns, tags })
            return (
              // A change has no id of its own — the commit's oid plus its position is stable across
              // renders since a commit's diff never reorders.
              <li key={`${entry.oid}-${index}`} className="text-[11px]">
                <span className="font-medium text-foreground">{display.label}</span>
                {display.note !== undefined ? (
                  <span className="ml-1 text-muted-foreground">{display.note}</span>
                ) : (
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {display.from}
                    </span>
                    <span aria-hidden="true" className="text-muted-foreground">
                      →
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                      {display.to}
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
