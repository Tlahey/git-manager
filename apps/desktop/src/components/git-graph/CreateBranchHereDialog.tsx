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
import { runActivity } from '../../lib/activityCorrelation'
import { useRepoDataStore } from '../../stores/repoData.store'

interface CreateBranchHereDialogProps {
  repoPath: string
  oid: string
  shortOid: string
  open: boolean
  onClose: () => void
}

/** Creates a new branch pointing at a given commit (the "Create branch here" action). */
export function CreateBranchHereDialog({
  repoPath,
  oid,
  shortOid,
  open,
  onClose,
}: CreateBranchHereDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  // Where the checkout below starts from, so the undo stack can put HEAD back. Read from the repo
  // cache rather than taken as a prop: both mount sites (the graph's overlay manager and the
  // sidebar's dialog manager) would otherwise have to thread it through.
  const repo = useRepoDataStore((s) => s.repoCache[repoPath])
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
      // One gesture, one correlation id — so one ⌘Z takes the whole thing back. Creating a branch
      // and checking it out are two git operations, and undoing only the first is not merely
      // incomplete: git refuses to delete a branch it has just made HEAD, so the undo failed
      // outright (and silently) before these two were grouped.
      await runActivity('git.createBranchHere', async () => {
        await apiCreateBranch(repoPath, trimmed, oid)
        if (checkout) {
          // `opts` is what makes the checkout undoable at all — without it `apiCheckoutBranch`
          // records nothing (see its own implementation).
          await apiCheckoutBranch(repoPath, trimmed, {
            fromRef: repo?.head ?? '',
            fromDetached: repo?.isDetached ?? false,
          })
        }
      })
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
