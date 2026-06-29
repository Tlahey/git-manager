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
} from 'lucide-react'
import { useReposStore } from '../../../stores/repos.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { useRepoSummary } from '../../../hooks/useRepoSummary'
import { apiOpenInEditor } from '../../../api/repo.api'

interface RepoRowProps {
  path: string
  name: string
  isSaved: boolean
  isPinned: boolean
  onToggleReadme: () => void
  isReadmeActive: boolean
}

export function RepoRow({
  path,
  name,
  isSaved,
  isPinned,
  onToggleReadme,
  isReadmeActive,
}: RepoRowProps) {
  const { t } = useTranslation('dashboard')
  const { togglePin, openTab, openTabs, closeTab } = useReposStore()
  const { settings } = useSettingsStore()

  const { data: summary, isLoading, error } = useRepoSummary(path)
  const loading = isLoading || (!summary && !error)

  async function handleOpenEditor(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const editor = settings.git.externalEditor || 'vscode'
      const customCmd = settings.git.externalEditorCommand || ''
      await apiOpenInEditor(path, editor, customCmd)
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
    const key = settings.git.externalEditor || 'vscode'
    switch (key) {
      case 'vscode':
        return 'VS Code'
      case 'cursor':
        return 'Cursor'
      case 'sublime':
        return 'Sublime Text'
      case 'intellij':
        return 'IntelliJ'
      default:
        return 'Éditeur personnalisé'
    }
  }, [settings.git.externalEditor])

  return (
    <div
      onClick={() => openTab(path)}
      className="group/row flex items-center justify-between px-4 py-3 hover:bg-accent/40 bg-transparent transition-all duration-150 cursor-pointer select-none border-b border-border/10 last:border-0 first:rounded-t-lg last:rounded-b-lg"
    >
      {/* Repo title & path */}
      <div className="flex items-center gap-2.5 min-w-0 pr-4 flex-1">
        {isSaved ? (
          <button
            onClick={handleTogglePin}
            className="text-muted-foreground/35 hover:text-amber-500 transition-colors duration-150 relative group/star shrink-0"
          >
            <Star className={`h-4 w-4 ${isPinned ? 'fill-amber-500 text-amber-500' : ''}`} />
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover/star:block bg-popover text-popover-foreground border border-border text-[9px] font-sans rounded px-1.5 py-0.5 whitespace-nowrap shadow-md z-50 pointer-events-none">
              {isPinned ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            </div>
          </button>
        ) : (
          <div className="h-4 w-4 shrink-0" />
        )}
        <div className="flex flex-col min-w-0">
          <span className="font-medium text-xs text-foreground group-hover/row:text-primary transition-colors truncate">
            {name}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-[320px]">
            {path}
          </span>
        </div>
      </div>

      {/* GIT STATUS COLUMNS */}
      <div className="flex items-center gap-4 shrink-0 mr-4 font-sans text-xs">
        {loading ? (
          <div className="flex items-center gap-1.5 text-muted-foreground/40">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span className="text-[10px] font-mono">Loading...</span>
          </div>
        ) : error ? (
          <span className="text-[10px] text-destructive/80 font-mono bg-destructive/10 border border-destructive/20 rounded px-1.5 py-0.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {t('dashboard.invalidRepo') || 'Invalide'}
          </span>
        ) : summary ? (
          <div className="flex items-center gap-3">
            {/* Branch info */}
            <div className="flex items-center gap-1 text-muted-foreground font-medium bg-muted/30 border border-border/30 rounded-md px-1.5 py-0.5 text-[10px] shrink-0 font-mono">
              <GitBranch className="h-3 w-3 shrink-0 text-primary/60" />
              <span className="truncate max-w-[80px]">{summary.head}</span>
            </div>

            {/* Changes details */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Conflicted */}
              {summary.conflictedCount > 0 && (
                <span
                  title={`${summary.conflictedCount} ${t('dashboard.conflictedChanges') || 'conflit(s)'}`}
                  className="bg-red-500/10 text-red-500 border border-red-500/25 rounded px-1.5 py-0.5 text-[10px] font-semibold animate-pulse leading-none font-mono"
                >
                  !{summary.conflictedCount}
                </span>
              )}

              {/* Staged */}
              {summary.stagedCount > 0 && (
                <span
                  title={`${summary.stagedCount} ${t('dashboard.stagedChanges') || 'staged'}`}
                  className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none font-mono"
                >
                  +{summary.stagedCount}
                </span>
              )}

              {/* Unstaged (Modified) */}
              {summary.unstagedCount > 0 && (
                <span
                  title={`${summary.unstagedCount} ${t('dashboard.unstagedChanges') || 'modified'}`}
                  className="bg-amber-500/10 text-amber-500 border border-amber-500/25 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none font-mono"
                >
                  ~{summary.unstagedCount}
                </span>
              )}

              {/* Untracked */}
              {summary.untrackedCount > 0 && (
                <span
                  title={`${summary.untrackedCount} ${t('dashboard.untrackedChanges') || 'untracked'}`}
                  className="bg-muted text-muted-foreground border border-border rounded px-1.5 py-0.5 text-[10px] font-medium leading-none font-mono"
                >
                  ?{summary.untrackedCount}
                </span>
              )}

              {/* Sync counts (Ahead/Behind vs upstream) */}
              {(summary.aheadCount > 0 || summary.behindCount > 0) && (
                <div className="flex items-center gap-1 bg-primary/5 text-primary border border-primary/10 rounded px-1.5 py-0.5 text-[10px] leading-none shrink-0 font-mono">
                  {summary.aheadCount > 0 && <span className="text-emerald-500 font-semibold">↑{summary.aheadCount}</span>}
                  {summary.behindCount > 0 && <span className="text-amber-500 font-semibold">↓{summary.behindCount}</span>}
                </div>
              )}

              {/* Clean repo status */}
              {summary.stagedCount === 0 &&
                summary.unstagedCount === 0 &&
                summary.untrackedCount === 0 &&
                summary.conflictedCount === 0 && (
                  <span title="Propre (Aucune modification)">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/80 shrink-0" />
                  </span>
                )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ACTIONS ON THE FAR RIGHT */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Open in Editor button */}
        {!error && (
          <div className="relative group/edit">
            <button
              onClick={handleOpenEditor}
              className="h-7 w-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/60 hover:border-border/80 transition-colors"
            >
              <Code className="h-3.5 w-3.5" />
            </button>
            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/edit:block bg-popover text-popover-foreground border border-border text-[9px] font-sans rounded px-1.5 py-0.5 whitespace-nowrap shadow-md z-50 pointer-events-none">
              {`${t('dashboard.openInEditor') || 'Ouvrir dans'} ${editorName}`}
            </div>
          </div>
        )}

        {/* README Details button */}
        {!error && (
          <div className="relative group/readme">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleReadme()
              }}
              className={`h-7 w-7 flex items-center justify-center rounded border transition-colors ${
                isReadmeActive
                  ? 'bg-primary/15 border-primary/40 text-primary hover:bg-primary/20'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/60 hover:border-border/80'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/readme:block bg-popover text-popover-foreground border border-border text-[9px] font-sans rounded px-1.5 py-0.5 whitespace-nowrap shadow-md z-50 pointer-events-none">
              {t('dashboard.showReadme') || 'Afficher le README'}
            </div>
          </div>
        )}

        {/* Add or Remove button (Open or Close Tab) */}
        {(() => {
          const isOpen = openTabs.includes(path)
          return (
            <div className="relative group/list-action">
              {isOpen ? (
                <button
                  onClick={handleCloseTab}
                  className="h-7 w-7 flex items-center justify-center rounded border border-border hover:border-red-500/30 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleOpenTab}
                  className="h-7 w-7 flex items-center justify-center rounded border border-border hover:border-primary/30 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/list-action:block bg-popover text-popover-foreground border border-border text-[9px] font-sans rounded px-1.5 py-0.5 whitespace-nowrap shadow-md z-50 pointer-events-none">
                {isOpen ? 'Fermer l\'onglet' : 'Ouvrir dans un onglet'}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
