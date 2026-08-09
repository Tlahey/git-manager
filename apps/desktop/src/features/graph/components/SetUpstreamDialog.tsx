import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Spinner,
  NativeSelect,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  toast,
} from '@git-manager/ui'
import { apiSetBranchUpstream } from '../../../api/git.api'
import { useBranches } from '../../../hooks/useBranches'
import { remoteTrackingBranches } from '../../../lib/branchUpstream'

interface SetUpstreamDialogProps {
  repoPath: string
  /** Local branch whose upstream is being set. */
  branch: string
  open: boolean
  onClose: () => void
}

/**
 * Lets the user pick which remote-tracking branch a local branch should track.
 *
 * Reached only for the cases `resolveDefaultUpstream` (see `lib/branchUpstream.ts`) could not
 * settle on its own — an unambiguous `origin/<branch>` match is applied directly from the branch
 * menus and never opens this dialog. Here, every remote-tracking branch in the repo is offered:
 * the local branch's own name is preselected when it exists among them, otherwise the user picks.
 */
export function SetUpstreamDialog({ repoPath, branch, open, onClose }: SetUpstreamDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const { data: branches } = useBranches(repoPath)
  const candidates = remoteTrackingBranches(branches ?? [])
  const [upstream, setUpstream] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Picks the initial selection once the branch list is in — only while nothing is selected yet,
  // so it never overwrites a choice the user already made while candidates kept refreshing.
  useEffect(() => {
    if (upstream || candidates.length === 0) return
    const preferred = candidates.find((c) => c.name === `origin/${branch}`)
    setUpstream((preferred ?? candidates[0]).name)
  }, [candidates, upstream, branch])

  async function handleConfirm() {
    if (!upstream) return
    setIsLoading(true)
    setError(null)
    try {
      await apiSetBranchUpstream(repoPath, branch, upstream)
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      toast.success(t('gitTree.branchMenu.upstreamSet', { branch, upstream }))
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
      <DialogContent data-testid="set-upstream-dialog">
        <DialogHeader>
          <DialogTitle>{t('gitTree.setUpstream.title')}</DialogTitle>
          <DialogDescription>{t('gitTree.setUpstream.description', { branch })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="set-upstream-empty">
              {t('gitTree.setUpstream.noRemoteBranches')}
            </p>
          ) : (
            <NativeSelect
              autoFocus
              data-testid="set-upstream-select"
              value={upstream}
              onChange={(e) => setUpstream(e.target.value)}
            >
              {candidates.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!upstream || isLoading}
            className="gap-1.5"
            data-testid="set-upstream-confirm-button"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('gitTree.setUpstream.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
