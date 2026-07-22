import { useState, type ReactNode } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Check, Copy, GitBranch, X } from 'lucide-react'
import { ScrollArea } from '@git-manager/ui'
import type { ActivityLogEntry } from '../../../stores/activityLog.store'
import type { ActivityBlock } from '../../../lib/groupActivityLog'
import { formatActivityDateTime, formatActivityTimestamp } from '../../../lib/formatActivityLog'
import { formatActivityData } from '../../../lib/formatActivityData'
import { activityCommandLine } from '../../../lib/activityCommandLine'

interface ActivityLogDetailProps {
  entry: ActivityLogEntry
  /** The correlated action the entry belongs to, used for the recap. */
  block: ActivityBlock | undefined
  /** Filters the stream down to a correlation id so the whole action's flow can be traced. */
  onTrace: (correlationId: string) => void
  onClose: () => void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 py-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{label}</span>
      <span className="min-w-0 break-all font-mono text-[11px] text-foreground">{children}</span>
    </div>
  )
}

/**
 * Master-detail side panel: the full record of a clicked log line plus a recap of the action it
 * belongs to (its git command, operation count, cumulative duration, and the ordered list of every
 * operation in the group). The associated data is shown in full here — the row itself only had a
 * truncated preview.
 */
export function ActivityLogDetail({ entry, block, onTrace, onClose }: ActivityLogDetailProps) {
  const { t } = useTranslation('common')
  const [copiedData, setCopiedData] = useState(false)
  const isError = entry.status === 'error'
  const commandLine = activityCommandLine(block?.label)
  // Always show an id: the correlation id for wrapped actions, else the operation's own id.
  const correlationId = entry.correlationId ?? block?.id ?? entry.id
  // The id is traceable (clickable to filter the stream) only for a real multi-operation action.
  const traceableId =
    entry.correlationId && block && block.entries.length > 1 ? entry.correlationId : null

  const data = formatActivityData(entry.args)

  async function copyData() {
    try {
      await navigator.clipboard.writeText(data)
      setCopiedData(true)
      setTimeout(() => setCopiedData(false), 1200)
    } catch {
      // Clipboard unavailable (denied/insecure context) — nothing else we can do here.
    }
  }

  return (
    <aside
      className="flex w-96 shrink-0 flex-col border-l border-border bg-card shadow-2xl"
      data-testid="activity-log-detail"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="truncate font-mono text-xs font-semibold text-foreground">
          {entry.command}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('activityLogs.detail.close')}
          data-testid="activity-detail-close"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          <Field label={t('activityLogs.detail.time')}>{formatActivityDateTime(entry.timestamp)}</Field>
          <Field label={t('activityLogs.detail.status')}>
            <span className={isError ? 'text-destructive' : 'text-emerald-500'}>
              {isError ? 'error' : 'ok'}
            </span>
          </Field>
          <Field label={t('activityLogs.detail.duration')}>{entry.durationMs}ms</Field>
          {entry.repoPath && (
            <Field label={t('activityLogs.detail.repository')}>{entry.repoPath}</Field>
          )}
          <Field label={t('activityLogs.detail.correlation')}>
            {traceableId ? (
              <button
                type="button"
                onClick={() => onTrace(traceableId)}
                title={t('activityLogs.detail.trace')}
                data-testid="activity-detail-trace"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <GitBranch className="h-3 w-3" />
                {correlationId}
              </button>
            ) : (
              correlationId
            )}
          </Field>

          {/* Recap of the whole action this line belongs to */}
          {block && (
            <div className="mt-3 rounded-md border border-border/60 bg-muted/20 p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-foreground">
                  {commandLine ?? block.label ?? block.entries[0].command}
                </span>
                <span className="text-[10px] text-muted-foreground/70">
                  {block.entries.length > 1
                    ? t('activityLogs.operationCount_plural', { count: block.entries.length })
                    : t('activityLogs.operationCount', { count: block.entries.length })}{' '}
                  · {block.totalDurationMs}ms
                </span>
              </div>
              <ul className="space-y-0.5 font-mono text-[10px]">
                {block.entries.map((op) => (
                  <li
                    key={op.id}
                    className={`flex items-baseline gap-2 rounded px-1 ${
                      op.id === entry.id ? 'bg-accent' : ''
                    }`}
                  >
                    <span className="text-muted-foreground/50">
                      {formatActivityTimestamp(op.timestamp)}
                    </span>
                    <span
                      className={
                        op.status === 'error' ? 'text-destructive' : 'text-emerald-500'
                      }
                    >
                      {op.status === 'error' ? 'error' : 'ok'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{op.command}</span>
                    <span className="shrink-0 text-muted-foreground/50">{op.durationMs}ms</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Full associated data (untruncated for objects) */}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                {t('activityLogs.detail.data')}
              </span>
              <button
                type="button"
                onClick={copyData}
                disabled={!data}
                aria-label={t('activityLogs.detail.copyData')}
                title={t('activityLogs.detail.copyData')}
                data-testid="activity-detail-copy-data"
                className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground/70 hover:text-foreground disabled:opacity-40"
              >
                {copiedData ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiedData ? t('activityLogs.copied') : t('activityLogs.detail.copyData')}
              </button>
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-all rounded-md border border-border/60 bg-muted/20 p-2 font-mono text-[10px] text-muted-foreground">
              {data || t('activityLogs.detail.noData')}
            </pre>
            {entry.error && (
              <pre className="mt-1 whitespace-pre-wrap break-all rounded-md border border-destructive/40 bg-destructive/10 p-2 font-mono text-[10px] text-destructive">
                {entry.error}
              </pre>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
