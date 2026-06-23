import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Spinner } from '@git-manager/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@git-manager/ui'
import { revertCommit } from '../../lib/tauri'

interface RevertDialogProps {
  repoPath: string
  commitOid: string
  commitSubject: string
  open: boolean
  onClose: () => void
  onSuccess: (newSha: string) => void
}

export function RevertDialog({
  repoPath,
  commitOid,
  commitSubject,
  open,
  onClose,
  onSuccess,
}: RevertDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [noCommit, setNoCommit] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setIsLoading(true)
    setError(null)
    try {
      const sha = await revertCommit(repoPath, commitOid, noCommit)
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      onSuccess(sha)
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('rollback.revert.title', { message: commitSubject })}
          </DialogTitle>
          <DialogDescription>
            {t('rollback.revert.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2">
          <input
            type="checkbox"
            id="no-commit"
            checked={noCommit}
            onChange={(e) => setNoCommit(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="no-commit" className="text-sm text-foreground cursor-pointer">
            {t('rollback.revert.noCommit')}
          </label>
        </div>

        {error && (
          <p className="rounded bg-destructive/20 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={isLoading}>
            {isLoading && <Spinner className="mr-1 h-3 w-3" />}
            {t('rollback.revert.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
