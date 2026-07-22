import { useState, type MouseEvent } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Check, Copy } from 'lucide-react'
import type { ActivityLogEntry } from '../../../stores/activityLog.store'
import { formatActivityLogEntry, formatActivityDateTime } from '../../../lib/formatActivityLog'

interface ActivityLogRowProps {
  entry: ActivityLogEntry
  selected: boolean
  onSelect: () => void
}

/**
 * One log line in the flat stream, styled like a console/Plex log: `timestamp  message`, on a single
 * truncated line (the full payload — and the correlation id that ties the action together — live in
 * the detail panel). Error lines are tinted red. Clicking the line opens its detail; a copy button on
 * hover copies just this line.
 */
export function ActivityLogRow({ entry, selected, onSelect }: ActivityLogRowProps) {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState(false)
  const isError = entry.status === 'error'

  const data =
    entry.args === undefined
      ? ''
      : typeof entry.args === 'string'
        ? entry.args
        : JSON.stringify(entry.args)

  async function copyLine(e: MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(formatActivityLogEntry(entry))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard unavailable (denied/insecure context) — nothing else we can do here.
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`group/row flex cursor-pointer items-baseline gap-3 px-3 py-[3px] ${
        isError
          ? 'bg-destructive/10 text-destructive hover:bg-destructive/15'
          : 'hover:bg-muted/40'
      } ${selected ? 'bg-accent' : ''}`}
      data-testid="activity-log-row"
      data-command={entry.command}
      data-entry-id={entry.id}
    >
      <span className="w-48 shrink-0 tabular-nums text-muted-foreground/60">
        {formatActivityDateTime(entry.timestamp)}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className={isError ? 'font-semibold' : 'font-semibold text-foreground'}>
          {entry.command}
        </span>
        {data && <span className="ml-2 text-muted-foreground/70">{data}</span>}
      </span>
      <button
        type="button"
        onClick={copyLine}
        aria-label={t('activityLogs.copyLine')}
        title={t('activityLogs.copyLine')}
        data-testid="activity-copy-line"
        className="shrink-0 rounded p-0.5 text-muted-foreground/70 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover/row:opacity-100"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  )
}
