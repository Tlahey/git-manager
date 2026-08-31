import { Copy } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import type { BoardColumn, BoardTag, CardHistoryEntry } from '@git-manager/git-types'
import { copyWithToast } from '../../../lib/clipboard'
import { formatExactDate } from '../../../lib/relativeDate'
import { describeCardFieldChange, type CardFieldChangeDisplay } from '../lib/cardHistoryChange'

interface CardActivityHistoryRowProps {
  entry: CardHistoryEntry
  columns: BoardColumn[]
  tags: BoardTag[]
}

interface LongTextColumnProps {
  label: string
  value: string
  testId: string
}

/** One side of a `'longText'` change's before/after pair — truncated so a full description doesn't
 * blow up the activity feed, with a copy button so the previous text can be pasted back in to undo
 * an edit. The button is a no-op-shaped `undefined` handler rather than merely disabled when `value`
 * is empty, so there is nothing to copy back for a field that was blank on that side. */
function LongTextColumn({ label, value, testId }: LongTextColumnProps) {
  const { t } = useTranslation('board')
  return (
    <div className="min-w-0 flex-1 rounded border border-border/60 bg-muted/30 p-1.5">
      <div className="mb-0.5 flex items-center justify-between gap-1">
        <span className="text-[9px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => copyWithToast(value, 'text')}
            className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t('card.history.copy')}
            title={t('card.history.copy')}
            data-testid={testId}
          >
            <Copy className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
      <p
        className="line-clamp-3 text-[11px] break-words text-foreground"
        title={value || undefined}
      >
        {value || t('card.history.none')}
      </p>
    </div>
  )
}

function FieldChange({
  display,
  entryOid,
  index,
}: {
  display: CardFieldChangeDisplay
  entryOid: string
  index: number
}) {
  const { t } = useTranslation('board')

  if (display.kind === 'note') {
    return <span className="ml-1 text-muted-foreground">{display.note}</span>
  }
  if (display.kind === 'longText') {
    return (
      <div className="mt-1 flex gap-2">
        <LongTextColumn
          label={t('card.history.before')}
          value={display.from}
          testId={`card-history-copy-before-${entryOid}-${index}`}
        />
        <LongTextColumn
          label={t('card.history.after')}
          value={display.to}
          testId={`card-history-copy-after-${entryOid}-${index}`}
        />
      </div>
    )
  }
  return (
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
  )
}

/**
 * One row of the activity feed's "All"/"History" view — a commit `card_history` found that touched
 * this card, turned into a before/after line per field (Jira's own history layout: who, when, then
 * "old value → new value" per changed field), rather than a single natural-language sentence.
 */
export function CardActivityHistoryRow({ entry, columns, tags }: CardActivityHistoryRowProps) {
  const { t, i18n } = useTranslation('board')

  return (
    <li
      className="rounded border border-border/60 bg-background px-2 py-1.5"
      data-testid={`card-history-entry-${entry.shortOid}`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground">{entry.authorName}</span>
        <span>{formatExactDate(entry.timestamp, i18n.language)}</span>
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
                <FieldChange display={display} entryOid={entry.oid} index={index} />
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
