import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import type { GitWorktree } from '@git-manager/git-types'
import {
  Button,
  Spinner,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@git-manager/ui'
import { apiPruneWorktrees } from '../../api/worktree.api'

interface PruneWorktreesDialogProps {
  repoPath: string
  /** The worktrees `list_worktrees` already flagged as prunable (folder gone from disk). */
  worktrees: GitWorktree[]
  open: boolean
  onClose: () => void
}

/** Removes administrative metadata for worktrees whose folder no longer exists on disk
 * (`git worktree prune`) — a single call cleans up every stale entry at once, unlike
 * `RemoveWorktreeDialog` which targets one worktree at a time. */
export function PruneWorktreesDialog({
  repoPath,
  worktrees,
  open,
  onClose,
}: PruneWorktreesDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setIsLoading(true)
    setError(null)
    try {
      await apiPruneWorktrees(repoPath)
      queryClient.invalidateQueries({ queryKey: ['worktrees', repoPath] })
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="worktree-prune-dialog">
        <DialogHeader>
          <DialogTitle>{t('worktree.prune')}</DialogTitle>
          <DialogDescription>
            {worktrees.length === 0
              ? t('worktree.pruneEmpty')
              : t('worktree.pruneDescription', { count: worktrees.length })}
          </DialogDescription>
        </DialogHeader>

        {worktrees.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto py-1 text-xs text-muted-foreground">
            {worktrees.map((wt) => (
              <li
                key={wt.path}
                className="truncate"
                data-testid={`worktree-prune-item-${wt.path}`}
              >
                {wt.branch} — {wt.path}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={isLoading || worktrees.length === 0}
            className="gap-1.5"
            data-testid="worktree-prune-confirm-button"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('worktree.prune')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
