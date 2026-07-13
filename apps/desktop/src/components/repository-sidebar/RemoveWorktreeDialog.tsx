import { useEffect, useState } from 'react'
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
import { apiRemoveWorktree } from '../../api/worktree.api'

interface RemoveWorktreeDialogProps {
  repoPath: string
  worktree: GitWorktree | null
  onClose: () => void
}

/** Removes a linked worktree. Locked worktrees are a hard block (git needs `--force` twice to
 * remove a locked+dirty one, and `remove_worktree` only ever sends one) — dirty-but-unlocked ones
 * require an explicit "force" opt-in checkbox, one tier lighter than hard-reset's typed `RESET`
 * gate since the blast radius (one worktree's directory) is smaller than rewriting history. */
export function RemoveWorktreeDialog({ repoPath, worktree, onClose }: RemoveWorktreeDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [force, setForce] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForce(false)
    setError(null)
  }, [worktree?.path])

  if (!worktree) return null
  const canConfirm = !worktree.isLocked && (!worktree.isDirty || force)

  async function handleConfirm() {
    if (!worktree || !canConfirm) return
    setIsLoading(true)
    setError(null)
    try {
      await apiRemoveWorktree(repoPath, worktree.path, force)
      queryClient.invalidateQueries({ queryKey: ['worktrees', repoPath] })
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) onClose()
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent data-testid="worktree-remove-dialog">
        <DialogHeader>
          <DialogTitle>{t('worktree.remove')}</DialogTitle>
          <DialogDescription>{worktree.path}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {worktree.isLocked ? (
            <p className="text-xs text-destructive">
              {t('worktree.removeLockedWarning', {
                reason: worktree.lockedReason ? ` (${worktree.lockedReason})` : '',
              })}
            </p>
          ) : (
            worktree.isDirty && (
              <div className="space-y-2">
                <p className="text-xs text-destructive">{t('worktree.removeDirtyWarning')}</p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={force}
                    onChange={(e) => setForce(e.target.checked)}
                    className="accent-primary"
                    data-testid="worktree-remove-force-checkbox"
                  />
                  {t('worktree.removeForceLabel')}
                </label>
              </div>
            )
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={!canConfirm || isLoading}
            className="gap-1.5"
            data-testid="worktree-remove-confirm-button"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('worktree.remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
