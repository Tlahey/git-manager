import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { CalendarClock, X, FolderOpen, RefreshCw } from 'lucide-react'
import { Alert, Button, Spinner, Tooltip } from '@git-manager/ui'
import { useDailySummaryHistory } from '../../hooks/useDailySummaryHistory'
import { useSummarySearch } from '../../hooks/useSummarySearch'
import { useDailySummary } from '../../hooks/useDailySummary'
import { useAiEnabled } from '../../hooks/useAiEnabled'
import { useSettingsStore } from '../../stores/settings.store'
import { apiOpenInEditor } from '../../api/repo.api'
import { apiOpenDailySummariesDir } from '../../api/dailySummary.api'
import type { StoredDailySummary } from '../../stores/dailySummary.store'
import { SummaryDayPicker } from '../daily-summaries/SummaryDayPicker'
import { SummaryAskPanel } from '../daily-summaries/SummaryAskPanel'
import { SummaryDayCard } from '../daily-summaries/SummaryDayCard'
import { localDateKey } from '../../lib/dailySummaryWindow'

interface DailySummariesPanelProps {
  repoPath: string
  onClose: () => void
}

/**
 * The archived daily briefings **for this repository**, in the graph's right-hand slot.
 *
 * Scoped to one repo rather than offered as a global page: a briefing is about a project, and the
 * question you ask of it ("when did I finish X here?") is asked while you are looking at that
 * project's history. Everything below — the filters, the local ranking, the model's shortlist —
 * therefore sees only this repo's days.
 *
 * Two ways in, because they answer different questions. **Pick a day** when you know when something
 * happened — that date is also the argument the generate button acts on, which is why the two sit
 * together. **Ask a question** when you remember the thing but not the day; that spends one model
 * call over the repository's whole archive.
 */
export function DailySummariesPanel({ repoPath, onClose }: DailySummariesPanelProps) {
  const { t } = useTranslation('dashboard')
  const { entries: repoEntries, isLoading, error, refresh, remove } =
    useDailySummaryHistory(repoPath)
  const { isGenerating, progress, skipped, error: generateError, generate } =
    useDailySummary(repoPath)
  const aiEnabled = useAiEnabled()
  const editorCommand = useSettingsStore((s) => s.settings.git.externalEditorCommand)

  /** The day being explored, and the argument generation acts on. `''` lists the whole archive. */
  const [date, setDate] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  // The only thing that narrows the list. Searching the *content* is the model's job — see
  // `useSummarySearch` for why there is no text box beside this.
  const scoped = useMemo(
    () => (date === '' ? repoEntries : repoEntries.filter((entry) => entry.date === date)),
    [repoEntries, date]
  )

  // The model reads the whole repository archive, not the day on screen: narrowing to one day would
  // make every question answerable only about the day you already found.
  const { answer, isAsking, askError, ask, clearAnswer } = useSummarySearch(repoEntries)

  /** A cited day from the AI answer: jump the list to exactly that day. */
  const selectMatch = useCallback((_repo: string, matchDate: string) => {
    setDate(matchDate)
  }, [])

  const openInEditor = useCallback(
    async (entry: StoredDailySummary) => {
      setActionError(null)
      try {
        await apiOpenInEditor(entry.filePath, editorCommand)
      } catch (err) {
        setActionError(String(err))
      }
    },
    [editorCommand]
  )

  const reveal = useCallback(async () => {
    setActionError(null)
    try {
      await apiOpenDailySummariesDir()
    } catch (err) {
      setActionError(String(err))
    }
  }, [])

  const deleteEntry = useCallback(
    async (entry: StoredDailySummary) => {
      setActionError(null)
      try {
        await remove(entry)
      } catch (err) {
        setActionError(String(err))
      }
    },
    [remove]
  )

  const generateLabel =
    progress?.phase === 'summarizing'
      ? t('dashboard.summary.summarizingFiles', {
          completed: progress.completed,
          total: progress.total,
        })
      : progress?.phase === 'composing'
        ? t('dashboard.summary.composing')
        : t('dashboard.summary.generating')

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-l border-border bg-card shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/10 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-semibold text-foreground">
            {t('summaries.title')}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Generation lives beside the date field, not up here: it needs a day to act on. */}
          <Tooltip content={t('summaries.openFolder')}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={reveal}
              aria-label={t('summaries.openFolder')}
              data-testid="summaries-open-folder"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content={t('summaries.refresh')}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => void refresh()}
              aria-label={t('summaries.refresh')}
              data-testid="summaries-refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </Tooltip>
          <Tooltip content={t('dashboard.summary.close')}>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t('dashboard.summary.close')}
              data-testid="summaries-close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      <SummaryAskPanel
        onAsk={(question) => void ask(question)}
        onClear={clearAnswer}
        answer={answer}
        isAsking={isAsking}
        error={askError}
        aiEnabled={aiEnabled}
        onSelectMatch={selectMatch}
      />

      <SummaryDayPicker
        date={date}
        onDateChange={setDate}
        onClear={() => setDate('')}
        onGenerate={() => void generate(date)}
        maxDate={localDateKey()}
        isGenerating={isGenerating}
        aiEnabled={aiEnabled}
        progressLabel={isGenerating ? generateLabel : null}
      />

      <div className="flex-1 select-text overflow-y-auto p-3">
        {skipped && !isGenerating && (
          <Alert className="mb-3 rounded-lg text-[11px]" data-testid="summaries-skipped">
            {t('dashboard.summary.noChanges')}
          </Alert>
        )}
        {(actionError || generateError) && (
          <Alert variant="destructive" className="mb-3 rounded-lg text-[11px]">
            {actionError ?? generateError}
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mb-3 rounded-lg text-[11px]">
            {t('summaries.loadError')}
          </Alert>
        )}

        {isLoading && repoEntries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="h-5 w-5" />
          </div>
        ) : scoped.length === 0 ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-muted-foreground/70"
            data-testid="summaries-empty"
          >
            <CalendarClock className="h-10 w-10 text-muted-foreground opacity-20" />
            <p className="max-w-[240px] text-xs leading-relaxed">
              {repoEntries.length === 0 ? t('summaries.emptyArchive') : t('summaries.noneForDay')}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5" data-testid="summaries-list">
            {scoped.map((entry) => (
              <SummaryDayCard
                key={entry.filePath}
                entry={entry}
                onOpenInEditor={openInEditor}
                onReveal={reveal}
                onDelete={deleteEntry}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
