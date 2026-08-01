import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
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
import { toast } from '@git-manager/ui'
import { apiDeleteRemoteBranch } from '../../api/git.api'

interface DeleteRemoteBranchDialogProps {
  repoPath: string
  branchName: string
  remote: string
  open: boolean
  onClose: () => void
}

/**
 * Confirms deleting a branch on the remote (`git push origin :refs/heads/<name>`). A network,
 * hard-to-undo operation, so it is gated behind an explicit confirmation rather than firing
 * straight from the context menu — mirrors {@link DeleteRemoteTagDialog}.
 */
export function DeleteRemoteBranchDialog({
  repoPath,
  branchName,
  remote,
  open,
  onClose,
}: DeleteRemoteBranchDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setIsLoading(true)
    setError(null)
    try {
      await apiDeleteRemoteBranch(repoPath, branchName, remote)
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      toast.success(t('gitTree.branchMenu.deletedRemote', { branch: branchName, remote }))
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
      <DialogContent data-testid="delete-remote-branch-dialog">
        <DialogHeader>
          <DialogTitle>
            {t('gitTree.branchMenu.deleteRemoteTitle', { branch: branchName, remote })}
          </DialogTitle>
          <DialogDescription>
            {t('gitTree.branchMenu.deleteRemoteConfirm', { branch: branchName, remote })}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="py-1 text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={isLoading}
            className="gap-1.5"
            data-testid="delete-remote-branch-confirm"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('gitTree.branchMenu.deleteRemoteAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
