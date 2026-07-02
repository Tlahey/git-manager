import { createPortal } from 'react-dom'
import {
  ArrowUpFromLine,
  ChevronRight,
  GitPullRequest,
  Redo2,
  Terminal as TerminalIcon,
  Undo2,
  Archive,
  ArchiveRestore,
} from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useActionToolbar } from '../../hooks/useActionToolbar'
import { RepoSelector } from './RepoSelector'
import { BranchContext } from './BranchContext'
import { StateTags } from './StateTags'
import { FetchButton } from './FetchButton'
import { BranchButton } from './BranchButton'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarSearch } from './ToolbarSearch'

interface ActionToolbarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
}

/** Barre d'actions principale (Partie 2) située sous les onglets. */
export function ActionToolbar({ searchQuery, onSearchChange }: ActionToolbarProps) {
  const { t } = useTranslation('git')

  const {
    activeRepo,
    fromRef,
    loading,
    notification,
    hasChanges,
    hasStashes,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    handleOpenTerminal,
    handleFetch,
    handleFetchAll,
    handlePull,
    handlePush,
    handleUndo,
    handleRedo,
    handleStash,
    handlePop,
    handleCreateBranch,
  } = useActionToolbar(t)

  const disabled = !activeRepo

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1 overflow-hidden border-b border-border bg-muted/30 px-2">
      {/* ── Section gauche : contexte ─────────────────────────── */}
      <div className="flex min-w-0 shrink items-center gap-1">
        <RepoSelector />
        <ChevronRight className="h-4 w-4 shrink-0 self-end pb-0.5 text-muted-foreground/40" />
        <BranchContext />
        <div className="ml-1 self-end pb-0.5">
          <StateTags />
        </div>
      </div>

      <div className="mx-1 hidden h-6 w-px shrink-0 bg-border sm:block" />

      {/* ── Section centrale : actions rapides ────────────────── */}
      <div className="flex min-w-0 shrink items-center gap-0.5 overflow-x-auto">
        <ToolbarButton
          icon={<Undo2 className="h-4 w-4 text-muted-foreground" />}
          label={t('toolbar.undo')}
          title={undoLabel ? t(undoLabel.key, undoLabel.params) : t('toolbar.undo')}
          loading={loading.undo}
          disabled={disabled || !canUndo}
          onClick={handleUndo}
          data-testid="toolbar-undo-button"
        />
        <ToolbarButton
          icon={<Redo2 className="h-4 w-4 text-muted-foreground" />}
          label={t('toolbar.redo')}
          title={redoLabel ? t(redoLabel.key, redoLabel.params) : t('toolbar.redo')}
          loading={loading.redo}
          disabled={disabled || !canRedo}
          onClick={handleRedo}
          data-testid="toolbar-redo-button"
        />

        <div className="mx-1 h-6 w-px shrink-0 bg-border" />

        <FetchButton
          loading={loading.fetch}
          onFetch={handleFetch}
          onFetchAll={handleFetchAll}
          onFetchPrune={handleFetch}
        />
        <ToolbarButton
          icon={<GitPullRequest className="h-4 w-4 text-blue-400" />}
          label={t('remote.pull')}
          loading={loading.pull}
          disabled={disabled}
          onClick={handlePull}
        />
        <ToolbarButton
          icon={<ArrowUpFromLine className="h-4 w-4 text-green-400" />}
          label={t('remote.push')}
          loading={loading.push}
          disabled={disabled}
          onClick={handlePush}
        />

        <div className="mx-1 h-6 w-px shrink-0 bg-border" />

        <BranchButton fromRef={fromRef} onCreate={handleCreateBranch} />
        <ToolbarButton
          icon={<Archive className="h-4 w-4 text-violet-400" />}
          label={t('toolbar.stash')}
          loading={loading.stash}
          disabled={disabled || !hasChanges}
          onClick={handleStash}
          data-testid="toolbar-stash-button"
        />
        <ToolbarButton
          icon={<ArchiveRestore className="h-4 w-4 text-violet-400" />}
          label={t('toolbar.pop')}
          loading={loading.pop}
          disabled={disabled || !hasStashes}
          onClick={handlePop}
        />

        <div className="mx-1 h-6 w-px shrink-0 bg-border" />

        <ToolbarButton
          icon={<TerminalIcon className="h-4 w-4 text-emerald-400" />}
          label={t('toolbar.terminal')}
          title="Ouvrir le terminal dans ce dépôt"
          disabled={!activeRepo}
          onClick={handleOpenTerminal}
          data-testid="toolbar-terminal-button"
        />
      </div>

      {/* ── Section droite : recherche & outils ───────────────── */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <ToolbarSearch value={searchQuery} onChange={onSearchChange} />
      </div>

      {/* Toast transitoire */}
      {notification &&
        createPortal(
          <div
            className={`fixed bottom-4 right-4 z-50 flex items-center rounded-md px-3 py-2 text-xs shadow-lg ${
              notification.type === 'success'
                ? 'bg-green-500/15 text-green-400 ring-1 ring-green-500/30'
                : 'bg-destructive/15 text-destructive ring-1 ring-destructive/30'
            }`}
          >
            {notification.message}
          </div>,
          document.body,
        )}
    </div>
  )
}
