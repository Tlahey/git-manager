import React, { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Tooltip, LlmIcon } from '@git-manager/ui'
import { Code, BookOpen, Plus, X } from 'lucide-react'
import { useSettingsStore } from '../../../stores/settings.store'
import { apiOpenInEditor } from '../../../api/repo.api'

interface RepoRowActionsProps {
  path: string
  /** Hides everything but nothing-to-do actions when the repo failed to open. */
  hasError: boolean
  isOpenInTab: boolean
  onOpenTab: () => void
  onCloseTab: () => void
  onToggleReadme: () => void
  isReadmeActive: boolean
  onToggleSummary: () => void
  isSummaryActive: boolean
  summaryEnabled: boolean
  /** Shows the "briefing ready" dot on the daily-summary button. */
  hasFreshSummary: boolean
}

const BUTTON_BASE =
  'flex h-7 w-7 cursor-pointer items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const BUTTON_IDLE =
  'border-border text-muted-foreground hover:border-border/80 hover:bg-accent/60 hover:text-foreground'
const BUTTON_ACTIVE = 'border-primary/40 bg-primary/15 text-primary hover:bg-primary/20'

/** The trailing button cluster of a dashboard row: external editor, AI briefing, README, tab. */
export function RepoRowActions({
  path,
  hasError,
  isOpenInTab,
  onOpenTab,
  onCloseTab,
  onToggleReadme,
  isReadmeActive,
  onToggleSummary,
  isSummaryActive,
  summaryEnabled,
  hasFreshSummary,
}: RepoRowActionsProps) {
  const { t } = useTranslation('dashboard')
  const { settings } = useSettingsStore()

  const editorName = useMemo(() => {
    const command = settings.git.externalEditorCommand
    const base = command.split('/').pop() || command
    return base.replace(/\.app$/, '')
  }, [settings.git.externalEditorCommand])

  async function handleOpenEditor(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await apiOpenInEditor(path, settings.git.externalEditorCommand)
    } catch (err) {
      console.error('Failed to launch editor:', err)
    }
  }

  function stopAnd(action: () => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      action()
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {!hasError && settings.git.externalEditorCommand && (
        <Tooltip content={`${t('dashboard.openInEditor')} — ${editorName}`}>
          <button
            type="button"
            data-testid="repo-row-editor-button"
            aria-label={`${t('dashboard.openInEditor')} — ${editorName}`}
            onClick={handleOpenEditor}
            className={`${BUTTON_BASE} ${BUTTON_IDLE}`}
          >
            <Code className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      )}

      {!hasError && summaryEnabled && (
        <Tooltip content={t('dashboard.summary.button')}>
          <button
            type="button"
            data-testid="repo-summary-button"
            aria-label={t('dashboard.summary.button')}
            aria-pressed={isSummaryActive}
            onClick={stopAnd(onToggleSummary)}
            className={`relative ${BUTTON_BASE} ${isSummaryActive ? BUTTON_ACTIVE : BUTTON_IDLE}`}
          >
            <LlmIcon className="h-3.5 w-3.5" />
            {hasFreshSummary && !isSummaryActive && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-card" />
            )}
          </button>
        </Tooltip>
      )}

      {!hasError && (
        <Tooltip content={t('dashboard.showReadme')}>
          <button
            type="button"
            data-testid="repo-row-readme-button"
            aria-label={t('dashboard.showReadme')}
            aria-pressed={isReadmeActive}
            onClick={stopAnd(onToggleReadme)}
            className={`${BUTTON_BASE} ${isReadmeActive ? BUTTON_ACTIVE : BUTTON_IDLE}`}
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      )}

      <Tooltip content={isOpenInTab ? t('dashboard.row.closeTab') : t('dashboard.row.openTab')}>
        <button
          type="button"
          data-testid="repo-row-tab-button"
          aria-label={isOpenInTab ? t('dashboard.row.closeTab') : t('dashboard.row.openTab')}
          onClick={stopAnd(isOpenInTab ? onCloseTab : onOpenTab)}
          className={
            isOpenInTab
              ? `${BUTTON_BASE} border-border text-muted-foreground hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500`
              : `${BUTTON_BASE} border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary`
          }
        >
          {isOpenInTab ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      </Tooltip>
    </div>
  )
}
