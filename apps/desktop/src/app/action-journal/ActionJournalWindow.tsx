import { useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { GraduationCap, RefreshCw, Search } from 'lucide-react'
import { Button, Input, ScrollArea, Spinner } from '@git-manager/ui'
import type { PooledAction } from '../../lib/actionPool'
import { appErrorMessage } from '../../lib/aiErrorMessage'
import { useAiEnabled } from '../../hooks/useAiEnabled'
import { useAiStatusCheck } from '../../hooks/useAiStatusCheck'
import { useAiStatusStore } from '../../stores/aiStatus.store'
import { useActionExplanationStore } from '../../stores/actionExplanation.store'
import { useTheme } from '../../hooks/useTheme'
import { ActionRow } from './components/ActionRow'
import { ActionDetailPanel } from './components/ActionDetailPanel'
import { useActionPool } from './useActionPool'

// Same platform check the other takeovers use to pad the header past the macOS traffic lights.
const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac')

/** Everything an action can be matched on by the filter box. */
function actionHaystack(action: PooledAction): string {
  return [
    action.label ?? '',
    action.repoPath ?? '',
    ...action.commands.map((command) => `${command.command} ${command.lines.join(' ')}`),
  ]
    .join(' ')
    .toLowerCase()
}

/**
 * "Behind the scenes": the last actions the user performed (`ACTION_POOL_SIZE` of them), each as the
 * git commands it ran, and — with a model configured — what those commands are for.
 *
 * Its own window rather than a tab or a takeover, because of what it is for: understanding the action
 * you just performed while the app itself stays where it was. A takeover would hide the graph the
 * commands are about, and reading a lesson is something you do *beside* the work, not instead of it.
 *
 * That choice has one consequence worth knowing before changing anything here: a separate
 * `WebviewWindow` is a separate JS context, so the in-memory activity buffer the main window fills is
 * unreachable. The pool is read off the rotating on-disk log instead (see {@link useActionPool}),
 * which is also what lets it survive a restart.
 */
function ActionJournalContent() {
  const { t } = useTranslation('common')
  const { actions, isLoading, error, refresh } = useActionPool()
  const explanations = useActionExplanationStore((s) => s.explanations)

  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Whether asking a model is possible at all. `disconnected` is the only state that hides the
  // affordance: while a check is still in flight, keeping the button is better than flickering it
  // away — a click then fails with a localized "provider not running", which says more than a
  // missing button.
  const aiEnabled = useAiEnabled()
  const connectionState = useAiStatusStore((s) => s.state)
  const aiAvailable = aiEnabled && connectionState !== 'disconnected'

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return query === '' ? actions : actions.filter((a) => actionHaystack(a).includes(query))
  }, [actions, filter])

  // The selection follows the list: an action can fall out of the pool while the window is open (the
  // pool is capped, and it refreshes on its own), and a panel about a vanished action would be a
  // frozen copy of something no longer in the journal.
  const selected = useMemo(
    () => actions.find((a) => a.id === selectedId) ?? null,
    [actions, selectedId]
  )

  return (
    <div
      data-testid="action-journal-window"
      className="flex h-screen flex-col bg-background text-foreground"
    >
      <header
        data-tauri-drag-region
        className={`chrome-surface flex shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 py-3 ${
          isMac ? 'pl-[84px]' : ''
        }`}
      >
        <GraduationCap className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">{t('actionJournal.title')}</h1>
          <p className="text-[11px] text-muted-foreground">{t('actionJournal.subtitle')}</p>
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('actionJournal.filterPlaceholder')}
            aria-label={t('actionJournal.filterPlaceholder')}
            data-testid="action-journal-filter"
            className="h-7 pl-8 text-[11px]"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2.5 text-[11px]"
          onClick={refresh}
          data-testid="action-journal-refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('actionJournal.refresh')}
        </Button>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {filtered.length > 1
            ? t('actionJournal.actionCount_plural', { count: filtered.length })
            : t('actionJournal.actionCount', { count: filtered.length })}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <ScrollArea className="min-w-0 flex-1">
          {error ? (
            <p
              className="break-words px-3 py-12 text-center text-[11px] text-tone-danger"
              data-testid="action-journal-error"
            >
              {appErrorMessage(error.message)}
            </p>
          ) : isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[11px] text-muted-foreground">
              <Spinner className="h-3.5 w-3.5" />
              {t('actionJournal.loading')}
            </div>
          ) : filtered.length === 0 ? (
            <p
              className="px-3 py-12 text-center text-[11px] text-muted-foreground"
              data-testid="action-journal-empty"
            >
              {actions.length === 0
                ? t('actionJournal.empty')
                : t('actionJournal.emptyNoMatch')}
            </p>
          ) : (
            filtered.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                selected={action.id === selectedId}
                explained={explanations[action.id] !== undefined}
                onSelect={() => setSelectedId(action.id)}
              />
            ))
          )}
        </ScrollArea>

        {selected && (
          <div className="w-[46%] min-w-[340px] max-w-[620px] shrink-0">
            <ActionDetailPanel
              // Keyed on the action so switching rows remounts the panel: its explanation hook holds
              // one action's stream, and reusing the instance would show the previous answer under the
              // new heading until the next run finished.
              key={selected.id}
              action={selected}
              aiAvailable={aiAvailable}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function ActionJournalWindow() {
  useTheme()
  // The provider check the main window runs at startup: this window has its own JS context, so the
  // status store starts empty here and nothing else would ever fill it.
  useAiStatusCheck()

  return <ActionJournalContent />
}
