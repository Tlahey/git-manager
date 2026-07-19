import React, { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  GitBranch,
  Code,
  BookOpen,
  Plus,
  X,
  Star,
  Sparkles,
} from 'lucide-react'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { useDailySummaryStore } from '../../../stores/dailySummary.store'
import { useRepoSummary } from '../../../hooks/useRepoSummary'
import { isSummaryStale } from '../../../lib/dailySummaryWindow'
import { apiOpenInEditor } from '../../../api/repo.api'

interface RepoRowProps {
  path: string
  name: string
  isSaved: boolean
  isPinned: boolean
  onToggleReadme: () => void
  isReadmeActive: boolean
  onToggleSummary: () => void
  isSummaryActive: boolean
  summaryEnabled: boolean
}

export function RepoRow({
  path,
  name,
  isSaved,
  isPinned,
  onToggleReadme,
  isReadmeActive,
  onToggleSummary,
  isSummaryActive,
  summaryEnabled,
}: RepoRowProps) {
  const { t } = useTranslation('dashboard')
  const { togglePin } = useRepoDataStore()
  const { openTab, openTabs, closeTab } = useRepoUIStore()
  const { settings } = useSettingsStore()

  const { data: summary, isLoading, error } = useRepoSummary(path)
  const loading = isLoading || (!summary && !error)

  const storedSummary = useDailySummaryStore((s) => s.summaries[path])
  const hasFreshSummary = storedSummary != null && !isSummaryStale(storedSummary.generatedAt)

  async function handleOpenEditor(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await apiOpenInEditor(path, settings.git.externalEditorCommand)
    } catch (err) {
      console.error('Failed to launch editor:', err)
    }
  }

  function handleOpenTab(e: React.MouseEvent) {
    e.stopPropagation()
    openTab(path)
  }

  function handleCloseTab(e: React.MouseEvent) {
    e.stopPropagation()
    closeTab(path)
  }

  function handleTogglePin(e: React.MouseEvent) {
    e.stopPropagation()
    togglePin(path)
  }

  const editorName = useMemo(() => {
    const command = settings.git.externalEditorCommand
    const base = command.split('/').pop() || command
    return base.replace(/\.app$/, '')
  }, [settings.git.externalEditorCommand])

  return (
    <div
      data-testid="dashboard-repo-row"
      onClick={() => openTab(path)}
      className="group/row flex cursor-pointer select-none items-center justify-between border-b border-border/10 bg-transparent px-4 py-3 transition-all duration-150 first:rounded-t-lg last:rounded-b-lg last:border-0 hover:bg-accent/40"
    >
      {/* Repo title & path */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5 pr-4">
        {isSaved ? (
          <button
            onClick={handleTogglePin}
            className="group/star relative shrink-0 text-muted-foreground/35 transition-colors duration-150 hover:text-amber-500"
          >
            <Star className={`h-4 w-4 ${isPinned ? 'fill-amber-500 text-amber-500' : ''}`} />
            <div className="pointer-events-none absolute left-full top-1/2 z-popover ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 font-sans text-[9px] text-popover-foreground shadow-md group-hover/star:block">
              {isPinned ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            </div>
          </button>
        ) : (
          <div className="h-4 w-4 shrink-0" />
        )}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-medium text-foreground transition-colors group-hover/row:text-primary">
            {name}
          </span>
          <span className="max-w-[320px] truncate font-mono text-[10px] text-muted-foreground/60">
            {path}
          </span>
        </div>
      </div>

      {/* GIT STATUS COLUMNS */}
      <div className="mr-4 flex shrink-0 items-center gap-4 font-sans text-xs">
        {loading ? (
          <div className="flex items-center gap-1.5 text-muted-foreground/40">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span className="font-mono text-[10px]">Loading...</span>
          </div>
        ) : error ? (
          <span className="flex items-center gap-1 rounded border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive/80">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {t('dashboard.invalidRepo') || 'Invalide'}
          </span>
        ) : summary ? (
          <div className="flex items-center gap-3">
            {/* Branch info */}
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/30 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              <GitBranch className="h-3 w-3 shrink-0 text-primary/60" />
              <span className="max-w-[80px] truncate">{summary.head}</span>
            </div>

            {/* Changes details */}
            <div className="flex shrink-0 items-center gap-1.5">
              {/* Conflicted */}
              {summary.conflictedCount > 0 && (
                <span
                  title={`${summary.conflictedCount} ${t('dashboard.conflictedChanges') || 'conflit(s)'}`}
                  className="animate-pulse rounded border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-red-500"
                >
                  !{summary.conflictedCount}
                </span>
              )}

              {/* Staged */}
              {summary.stagedCount > 0 && (
                <span
                  title={`${summary.stagedCount} ${t('dashboard.stagedChanges') || 'staged'}`}
                  className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-emerald-500"
                >
                  +{summary.stagedCount}
                </span>
              )}

              {/* Unstaged (Modified) */}
              {summary.unstagedCount > 0 && (
                <span
                  title={`${summary.unstagedCount} ${t('dashboard.unstagedChanges') || 'modified'}`}
                  className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-amber-500"
                >
                  ~{summary.unstagedCount}
                </span>
              )}

              {/* Untracked */}
              {summary.untrackedCount > 0 && (
                <span
                  title={`${summary.untrackedCount} ${t('dashboard.untrackedChanges') || 'untracked'}`}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-muted-foreground"
                >
                  ?{summary.untrackedCount}
                </span>
              )}

              {/* Sync counts (Ahead/Behind vs upstream) */}
              {(summary.aheadCount > 0 || summary.behindCount > 0) && (
                <div className="flex shrink-0 items-center gap-1 rounded border border-primary/10 bg-primary/5 px-1.5 py-0.5 font-mono text-[10px] leading-none text-primary">
                  {summary.aheadCount > 0 && (
                    <span className="font-semibold text-emerald-500">↑{summary.aheadCount}</span>
                  )}
                  {summary.behindCount > 0 && (
                    <span className="font-semibold text-amber-500">↓{summary.behindCount}</span>
                  )}
                </div>
              )}

              {/* Clean repo status */}
              {summary.stagedCount === 0 &&
                summary.unstagedCount === 0 &&
                summary.untrackedCount === 0 &&
                summary.conflictedCount === 0 && (
                  <span title="Propre (Aucune modification)">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500/80" />
                  </span>
                )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ACTIONS ON THE FAR RIGHT */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Open in Editor button */}
        {!error && settings.git.externalEditorCommand && (
          <div className="group/edit relative">
            <button
              onClick={handleOpenEditor}
              className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent/60 hover:text-foreground"
            >
              <Code className="h-3.5 w-3.5" />
            </button>
            <div className="pointer-events-none absolute right-full top-1/2 z-popover mr-2 hidden -translate-y-1/2 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 font-sans text-[9px] text-popover-foreground shadow-md group-hover/edit:block">
              {`${t('dashboard.openInEditor') || 'Ouvrir dans'} ${editorName}`}
            </div>
          </div>
        )}

        {/* Daily-summary (AI briefing) button */}
        {!error && summaryEnabled && (
          <div className="group/summary relative">
            <button
              data-testid="repo-summary-button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleSummary()
              }}
              className={`relative flex h-7 w-7 items-center justify-center rounded border transition-colors ${
                isSummaryActive
                  ? 'border-primary/40 bg-primary/15 text-primary hover:bg-primary/20'
                  : 'border-border text-muted-foreground hover:border-border/80 hover:bg-accent/60 hover:text-foreground'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {/* Fresh briefing available for today */}
              {hasFreshSummary && !isSummaryActive && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-card" />
              )}
            </button>
            <div className="pointer-events-none absolute right-full top-1/2 z-popover mr-2 hidden -translate-y-1/2 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 font-sans text-[9px] text-popover-foreground shadow-md group-hover/summary:block">
              {t('dashboard.summary.button') || 'Briefing du jour'}
            </div>
          </div>
        )}

        {/* README Details button */}
        {!error && (
          <div className="group/readme relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleReadme()
              }}
              className={`flex h-7 w-7 items-center justify-center rounded border transition-colors ${
                isReadmeActive
                  ? 'border-primary/40 bg-primary/15 text-primary hover:bg-primary/20'
                  : 'border-border text-muted-foreground hover:border-border/80 hover:bg-accent/60 hover:text-foreground'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
            <div className="pointer-events-none absolute right-full top-1/2 z-popover mr-2 hidden -translate-y-1/2 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 font-sans text-[9px] text-popover-foreground shadow-md group-hover/readme:block">
              {t('dashboard.showReadme') || 'Afficher le README'}
            </div>
          </div>
        )}

        {/* Add or Remove button (Open or Close Tab) */}
        {(() => {
          const isOpen = openTabs.includes(path)
          return (
            <div className="group/list-action relative">
              {isOpen ? (
                <button
                  onClick={handleCloseTab}
                  className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleOpenTab}
                  className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="pointer-events-none absolute right-full top-1/2 z-popover mr-2 hidden -translate-y-1/2 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 font-sans text-[9px] text-popover-foreground shadow-md group-hover/list-action:block">
                {isOpen ? "Fermer l'onglet" : 'Ouvrir dans un onglet'}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
