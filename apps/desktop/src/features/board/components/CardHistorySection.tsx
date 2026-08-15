import { useTranslation } from '@git-manager/i18n'
import { Spinner } from '@git-manager/ui'
import type { BoardColumn, BoardTag, CardHistoryEntry } from '@git-manager/git-types'
import { CardContentSection } from './CardContentSection'
import { formatCardHistoryChange } from '../lib/cardHistoryChange'

interface CardHistorySectionProps {
  history: CardHistoryEntry[]
  loading?: boolean
  columns: BoardColumn[]
  tags: BoardTag[]
}

function formatEntryDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

/**
 * The card's activity feed — every commit `card_history`/`apiGetCardHistory` found that touched
 * this card, turned into what changed. Read-only, and local-only: a remote (GitHub-backed) card has
 * no ref to walk, so `EditCardDialog` only renders this when `history` is passed at all.
 *
 * Placed after `CardCommentsSection`, the last block of the content column, since it is the least
 * frequently consulted — description and discussion are what a card is *about*; this is what
 * happened to it.
 */
export function CardHistorySection({ history, loading, columns, tags }: CardHistorySectionProps) {
  const { t } = useTranslation('board')

  return (
    <CardContentSection
      title={t('card.history.label')}
      sectionKey="card-history"
      testId="card-history-section"
      aside={
        history.length > 0 ? (
          <span className="text-[11px] font-medium text-foreground">{history.length}</span>
        ) : undefined
      }
    >
      {loading ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Spinner className="h-3 w-3" /> {t('card.history.loading')}
        </p>
      ) : history.length === 0 ? (
        <p className="text-[11px] text-muted-foreground" data-testid="card-history-empty">
          {t('card.history.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {history.map((entry) => (
            <li
              key={entry.oid}
              className="rounded border border-border/60 bg-background px-2 py-1.5"
              data-testid={`card-history-entry-${entry.shortOid}`}
            >
              <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">{entry.authorName}</span>
                <span>{formatEntryDate(entry.timestamp)}</span>
              </div>
              <ul className="space-y-0.5 text-[11px] text-foreground">
                {entry.kind === 'created' ? (
                  <li>{t('card.history.created')}</li>
                ) : entry.kind === 'deleted' ? (
                  <li>{t('card.history.deleted')}</li>
                ) : (
                  entry.changes.map((change, index) => (
                    // Changes within one commit have no id of their own — the commit's oid plus
                    // their position is stable across renders since a commit's diff never reorders.
                    <li key={`${entry.oid}-${index}`}>
                      {formatCardHistoryChange(change, { t, columns, tags })}
                    </li>
                  ))
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </CardContentSection>
  )
}
