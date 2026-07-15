import { FileText, FolderGit2, AlertTriangle, GitMerge } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'

/** Message-column content for the primary (own-repo) "// WIP" row: an editable commit message
 * input bound to the per-repo WIP draft, committable on Enter. */
export function WipCommitInput({
  totalChanges,
  onCommit,
}: {
  totalChanges: number
  onCommit?: (message: string) => void
}) {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const wipMessages = useRepoDataStore((s) => s.wipMessages)
  const setWipMessage = useRepoDataStore((s) => s.setWipMessage)

  const value = activeRepo ? wipMessages[activeRepo] || '' : ''

  function setValue(val: string) {
    if (activeRepo) {
      setWipMessage(activeRepo, val)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (value.trim()) {
        onCommit?.(value)
      }
    }
  }

  return (
    <div className="flex w-full items-center gap-2 pr-4" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="// WIP"
        className="h-6 min-w-0 flex-1 rounded border border-border bg-transparent px-2 text-[11px] text-foreground placeholder-muted-foreground/60 transition-colors focus:border-primary/60 focus:outline-none"
      />
      <div
        className="flex shrink-0 items-center gap-1 rounded border border-border/30 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
        title={`${totalChanges} files changed`}
      >
        <FileText className="h-3 w-3 text-muted-foreground/60" />
        <span>{totalChanges}</span>
      </div>
    </div>
  )
}

/** Message-column content for a secondary "// WIP" row anchored to another linked worktree's
 * branch: read-only file count, plus an "Open Worktree" action revealed only once the row is
 * selected/primary (`showOpenButton`) — kept out of the way otherwise so it doesn't compete with
 * every other row's message text. No commit input — committing into another worktree isn't
 * something this row does. */
export function WorktreeWipRow({
  branch,
  totalChanges,
  onOpenWorktree,
  showOpenButton,
}: {
  branch: string
  totalChanges: number
  onOpenWorktree?: () => void
  showOpenButton?: boolean
}) {
  const { t } = useTranslation('git')
  return (
    <div className="flex w-full items-center gap-2 pr-4" onClick={(e) => e.stopPropagation()}>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/70">
        // WIP <span className="text-muted-foreground/50">— {branch}</span>
      </span>
      <div
        className="flex shrink-0 items-center gap-1 rounded border border-border/30 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
        title={`${totalChanges} files changed`}
      >
        <FileText className="h-3 w-3 text-muted-foreground/60" />
        <span>{totalChanges}</span>
      </div>
      {showOpenButton && (
        <button
          type="button"
          onClick={onOpenWorktree}
          className="flex shrink-0 items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          <FolderGit2 className="h-3 w-3" />
          {t('gitTree.wip.openWorktree')}
        </button>
      )}
    </div>
  )
}

/** Message-column content for the synthetic "CONFLICT" row (paused rebase). */
export function ConflictRowMessage({ count, branchName }: { count: number; branchName?: string }) {
  const { t } = useTranslation('git')
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 pr-4">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-white" />
      <GitMerge className="h-3.5 w-3.5 shrink-0 text-white" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white">
        {t('gitTree.contextMenu.conflictBannerMessage', { count, branch: branchName ?? '' })}
      </span>
    </div>
  )
}
