import { useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { ArrowLeft, FolderOpen, GitBranch, Search, X } from 'lucide-react'
import { Button, Input, NativeSelect, ScrollArea, Separator } from '@git-manager/ui'
import { useActivityLogStore, type ActivityLogEntry } from '../../stores/activityLog.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { apiOpenActivityLogsDir } from '../../api/activityLog.api'
import { groupActivityLog, type ActivityScope } from '../../lib/groupActivityLog'
import { ActivityLogRow } from './components/ActivityLogRow'
import { ActivityLogDetail } from './components/ActivityLogDetail'
import { ActivityScopeSwitch } from './components/ActivityScopeSwitch'

// Same platform check the Settings takeover uses to pad the header past the macOS traffic lights.
const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac')

type LevelFilter = 'all' | 'error'

function entryHaystack(e: ActivityLogEntry): string {
  const args = e.args === undefined ? '' : typeof e.args === 'string' ? e.args : JSON.stringify(e.args)
  return `${e.command} ${e.correlationLabel ?? ''} ${args} ${e.error ?? ''}`.toLowerCase()
}

/**
 * Full-screen takeover (reached from the footer) showing every backend operation the app performed
 * as a flat, filterable log stream, grouped by user action via a shared bracketed id (see
 * `lib/groupActivityLog.ts`). Clicking a line opens a master-detail panel with its full record and a
 * recap of the action it belongs to. Capture is always on (no enable switch). Two scopes: the whole
 * Application, or just the active Repository's operations.
 */
export function ActivityLogsPage({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('common')
  const entries = useActivityLogStore((s) => s.entries)
  const activeRepo = useRepoUIStore((s) => s.activeRepo)

  const [scope, setScope] = useState<ActivityScope>('application')
  const [filter, setFilter] = useState('')
  const [level, setLevel] = useState<LevelFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // When set, the stream is narrowed to a single action's correlation id to trace its flow.
  const [traceId, setTraceId] = useState<string | null>(null)

  // Repository scope only makes sense with a repo open; fall back to Application otherwise.
  const repositoryEnabled = activeRepo !== null
  const effectiveScope: ActivityScope = repositoryEnabled ? scope : 'application'

  const blocks = useMemo(
    () => groupActivityLog(entries, effectiveScope, activeRepo),
    [entries, effectiveScope, activeRepo]
  )

  // Apply the trace + search + level filters within each action, dropping actions left with no lines.
  const filteredBlocks = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return blocks
      .map((b) => ({
        ...b,
        entries: b.entries.filter(
          (e) =>
            (traceId === null || e.correlationId === traceId) &&
            (level !== 'error' || e.status === 'error') &&
            (query === '' || entryHaystack(e).includes(query))
        ),
      }))
      .filter((b) => b.entries.length > 0)
  }, [blocks, filter, level, traceId])

  const visibleCount = useMemo(
    () => filteredBlocks.reduce((n, b) => n + b.entries.length, 0),
    [filteredBlocks]
  )

  // Resolve the selected line and build the recap from EVERY entry sharing its correlation id — the
  // whole action, independent of the current scope/filter — so the detail can trace it end to end.
  const selected = useMemo(() => {
    if (!selectedId) return null
    const entry = entries.find((e) => e.id === selectedId)
    if (!entry) return null
    const related = entry.correlationId
      ? entries.filter((e) => e.correlationId === entry.correlationId)
      : [entry]
    const block = {
      id: entry.correlationId ?? entry.id,
      label: entry.correlationLabel,
      entries: related,
      startTimestamp: Math.min(...related.map((e) => e.timestamp)),
      totalDurationMs: related.reduce((n, e) => n + e.durationMs, 0),
    }
    return { entry, block }
  }, [entries, selectedId])

  const hasActivity = blocks.length > 0
  const emptyMessage = !hasActivity
    ? effectiveScope === 'repository'
      ? t('activityLogs.empty.repository')
      : t('activityLogs.empty.application')
    : t('activityLogs.empty.noMatch')

  return (
    <div
      data-testid="activity-logs-page"
      className="flex h-screen flex-col bg-background text-foreground"
    >
      <header
        data-tauri-drag-region
        className={`chrome-surface flex shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 py-3 ${
          isMac ? 'pl-[72px]' : ''
        }`}
      >
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onClose}>
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('activityLogs.back')}
        </Button>
        <div>
          <h1 className="text-sm font-semibold">{t('activityLogs.title')}</h1>
          <p className="text-[11px] text-muted-foreground">{t('activityLogs.subtitle')}</p>
        </div>
      </header>

      {/* Toolbar: scope · level · search · open folder */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <ActivityScopeSwitch
          scope={effectiveScope}
          onScopeChange={setScope}
          repositoryEnabled={repositoryEnabled}
        />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <NativeSelect
          value={level}
          onChange={(e) => setLevel(e.target.value as LevelFilter)}
          aria-label={t('activityLogs.level.label')}
          data-testid="activity-level-filter"
          className="h-7 w-28 text-[11px]"
        >
          <option value="all">{t('activityLogs.level.all')}</option>
          <option value="error">{t('activityLogs.level.errors')}</option>
        </NativeSelect>
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('activityLogs.filterPlaceholder')}
            aria-label={t('activityLogs.filterPlaceholder')}
            data-testid="activity-filter-input"
            className="h-7 pl-8 text-[11px]"
          />
        </div>
        {traceId && (
          <span
            className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
            data-testid="activity-trace-chip"
          >
            <GitBranch className="h-3 w-3" />
            {t('activityLogs.trace.label')}: {traceId.length > 8 ? traceId.slice(-8) : traceId}
            <button
              type="button"
              onClick={() => setTraceId(null)}
              aria-label={t('activityLogs.trace.clear')}
              data-testid="activity-trace-clear"
              className="ml-0.5 rounded hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2.5 text-[11px]"
          onClick={() => void apiOpenActivityLogsDir()}
          data-testid="activity-open-folder"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t('activityLogs.openFolder')}
        </Button>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {visibleCount > 1
            ? t('activityLogs.operationCount_plural', { count: visibleCount })
            : t('activityLogs.operationCount', { count: visibleCount })}
        </span>
      </div>

      {/* Body: flat log stream + detail panel */}
      <div className="flex flex-1 overflow-hidden">
        <ScrollArea className="flex-1">
          {filteredBlocks.length === 0 ? (
            <p
              className="px-3 py-12 text-center text-[11px] text-muted-foreground"
              data-testid="activity-empty"
            >
              {emptyMessage}
            </p>
          ) : (
            <div className="font-mono text-[11px] leading-relaxed">
              {/* Sticky column header so the columns stay labelled while scrolling */}
              <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                <span className="w-48 shrink-0">{t('activityLogs.col.time')}</span>
                <span className="min-w-0 flex-1">{t('activityLogs.col.message')}</span>
                <span className="w-5 shrink-0" aria-hidden="true" />
              </div>
              {filteredBlocks.map((block, i) => (
                <div key={block.id} className={i > 0 ? 'border-t border-border/40' : ''}>
                  {block.entries.map((entry) => (
                    <ActivityLogRow
                      key={entry.id}
                      entry={entry}
                      selected={entry.id === selectedId}
                      onSelect={() => setSelectedId(entry.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        {selected && (
          <ActivityLogDetail
            entry={selected.entry}
            block={selected.block}
            onTrace={setTraceId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}
