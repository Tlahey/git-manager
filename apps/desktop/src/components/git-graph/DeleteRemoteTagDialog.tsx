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
import { apiDeleteRemoteTag } from '../../api/git.api'

interface DeleteRemoteTagDialogProps {
  repoPath: string
  tagName: string
  remote: string
  open: boolean
  onClose: () => void
}

/**
 * Confirms deleting a tag on the remote (`git push origin :refs/tags/<name>`). A network,
 * hard-to-undo operation, so it is gated behind an explicit confirmation rather than firing straight
 * from the context menu.
 */
export function DeleteRemoteTagDialog({
  repoPath,
  tagName,
  remote,
  open,
  onClose,
}: DeleteRemoteTagDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setIsLoading(true)
    setError(null)
    try {
      await apiDeleteRemoteTag(repoPath, tagName, remote)
      queryClient.invalidateQueries({ queryKey: ['tags', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      toast.success(t('gitTree.tagMenu.deletedRemote', { tag: tagName, remote }))
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
      <DialogContent data-testid="delete-remote-tag-dialog">
        <DialogHeader>
          <DialogTitle>{t('gitTree.tagMenu.deleteRemote', { tag: tagName, remote })}</DialogTitle>
          <DialogDescription>
            {t('gitTree.tagMenu.deleteRemoteConfirm', { tag: tagName, remote })}
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
            data-testid="delete-remote-tag-confirm"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('gitTree.tagMenu.deleteRemoteAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
