import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Spinner,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  toast,
} from '@git-manager/ui'
import { apiRenameBranch } from '../../api/git.api'

interface RenameBranchDialogProps {
  repoPath: string
  /** Current name of the local branch being renamed. */
  branch: string
  open: boolean
  onClose: () => void
}

/** Renames a local branch (the branch menus' "Rename" action). */
export function RenameBranchDialog({ repoPath, branch, open, onClose }: RenameBranchDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [name, setName] = useState(branch)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === branch) return
    setIsLoading(true)
    setError(null)
    try {
      await apiRenameBranch(repoPath, branch, trimmed)
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      toast.success(t('gitTree.renameBranch.renamed', { branch: trimmed }))
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
      <DialogContent data-testid="rename-branch-dialog">
        <DialogHeader>
          <DialogTitle>{t('gitTree.renameBranch.title')}</DialogTitle>
          <DialogDescription>{t('gitTree.renameBranch.description', { branch })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="rename-branch-name-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm()
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!name.trim() || name.trim() === branch || isLoading}
            className="gap-1.5"
            data-testid="rename-branch-confirm-button"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('gitTree.renameBranch.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
