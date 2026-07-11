import { useTranslation } from '@git-manager/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Spinner, toast } from '@git-manager/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@git-manager/ui'
import { apiAutosquashPreview, apiRunAutosquash, apiGetRebaseState } from '../../api/git.api'
import { useState } from 'react'

interface AutosquashPreviewDialogProps {
  repoPath: string
  open: boolean
  onClose: () => void
}

export function AutosquashPreviewDialog({
  repoPath,
  open,
  onClose,
}: AutosquashPreviewDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['autosquash-preview', repoPath],
    queryFn: () => apiAutosquashPreview(repoPath),
    enabled: open,
  })

  const totalFixups = groups.reduce((acc, g) => acc + g.fixups.length, 0)

  async function handleConfirm() {
    setIsRunning(true)
    setError(null)
    try {
      await apiRunAutosquash(repoPath)
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['pending-fixups', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['rebase-state', repoPath] })

      // A conflict pause resolves this call successfully (it's an expected outcome, not a
      // failure) — check the actual repo state to tell it apart from a clean completion so
      // the toast doesn't lie about the rebase being done.
      const rebaseState = await apiGetRebaseState(repoPath)
      if (rebaseState.kind === 'conflict' || rebaseState.kind === 'edit_pause') {
        toast.warning(t('gitTree.contextMenu.rebaseConflict'))
      } else {
        toast.success(t('fixup.autosquash.success'))
      }
      onClose()
    } catch (err) {
      toast.error(String(err))
      setError(String(err))
    } finally {
      setIsRunning(false)
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('fixup.autosquash.title')}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('fixup.autosquash.summary', { count: totalFixups })}
            </p>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {groups.map((group) => (
                <div
                  key={group.baseOid}
                  className="rounded border border-border bg-muted/30 p-3 space-y-1"
                >
                  <p className="text-xs font-medium text-foreground truncate">
                    {group.baseSubject}
                  </p>
                  {group.fixups.map((sha) => (
                    <div key={sha} className="flex items-center gap-2 pl-3 text-xs text-muted-foreground">
                      <span className="h-px w-3 bg-border" />
                      <code className="font-mono">fixup! {sha}</code>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground opacity-70">
              {t('fixup.autosquash.warning', {
                defaultValue:
                  'Warning: if some commits have been pushed, a force push will be required.',
              })}
            </p>
          </div>
        )}

        {error && (
          <p className="rounded bg-destructive/20 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isRunning}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={isRunning || isLoading || groups.length === 0}
          >
            {isRunning && <Spinner className="mr-1 h-3 w-3" />}
            {t('fixup.autosquash.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
