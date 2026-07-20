import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  Spinner,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@git-manager/ui'
import { apiCreateBranch, apiCheckoutBranch } from '../../api/git.api'

interface CreateBranchHereDialogProps {
  repoPath: string
  oid: string
  shortOid: string
  open: boolean
  onClose: () => void
}

/** Crée une nouvelle branche pointant sur un commit donné (action « Créer une branche ici »). */
export function CreateBranchHereDialog({
  repoPath,
  oid,
  shortOid,
  open,
  onClose,
}: CreateBranchHereDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [checkout, setCheckout] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    const trimmed = name.trim()
    if (!trimmed) return
    setIsLoading(true)
    setError(null)
    try {
      await apiCreateBranch(repoPath, trimmed, oid)
      if (checkout) {
        await apiCheckoutBranch(repoPath, trimmed)
      }
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      setName('')
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
      <DialogContent data-testid="create-branch-dialog">
        <DialogHeader>
          <DialogTitle>{t('gitTree.actions.createBranch')}</DialogTitle>
          <DialogDescription>{t('gitTree.createBranch.from', { sha: shortOid })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('gitTree.createBranch.placeholder')}
            data-testid="create-branch-name-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm()
            }}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={checkout} onChange={(e) => setCheckout(e.target.checked)} />
            {t('gitTree.createBranch.checkout')}
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!name.trim() || isLoading}
            className="gap-1.5"
            data-testid="create-branch-confirm-button"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('gitTree.contextMenu.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
