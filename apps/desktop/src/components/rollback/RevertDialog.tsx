import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Spinner, Checkbox, RadioGroup, RadioGroupItem } from '@git-manager/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@git-manager/ui'
import { apiRevertCommit } from '../../api/git.api'

/** One parent of the commit being reverted, as offered in the mainline picker. */
export interface RevertParent {
  oid: string
  shortOid: string
  subject: string
}

interface RevertDialogProps {
  repoPath: string
  commitOid: string
  commitSubject: string
  /**
   * The commit's parents, in git's own order. Only read when there is more than one — i.e. on a
   * merge commit, where `git revert` cannot run until it is told which parent is the mainline.
   * A single-parent commit needs none of this, so the caller may leave it out entirely.
   */
  parents?: RevertParent[]
  open: boolean
  onClose: () => void
  onSuccess: (newSha: string) => void
}

/**
 * Confirms a revert, and on a **merge** commit first asks which parent is the mainline.
 *
 * That question is unavoidable rather than a nicety: a merge has no single "before" state, so git
 * refuses to invert one until `-m` names the side to keep. Picking parent 1 undoes what was merged
 * in; picking parent 2 undoes the branch that received it. Both readings are legitimate, which is
 * exactly why nothing here guesses one.
 *
 * The picker is the only difference from the ordinary path — same dialog, same confirm, same
 * `no-commit` option — so an ordinary commit's revert is untouched by any of it.
 */
export function RevertDialog({
  repoPath,
  commitOid,
  commitSubject,
  parents = [],
  open,
  onClose,
  onSuccess,
}: RevertDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [noCommit, setNoCommit] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isMerge = parents.length > 1
  // 1-based, matching `git revert -m`. Defaults to the first parent, which is the mainline of a
  // merge made on the branch the user is standing on — the common case, never a silent one.
  const [mainline, setMainline] = useState(1)

  async function handleConfirm() {
    setIsLoading(true)
    setError(null)
    try {
      const sha = await apiRevertCommit(
        repoPath,
        commitOid,
        noCommit,
        isMerge ? mainline : undefined
      )
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
      <DialogContent className="max-w-md" data-testid="revert-dialog">
        <DialogHeader>
          <DialogTitle>{t('rollback.revert.title', { message: commitSubject })}</DialogTitle>
          <DialogDescription>
            {isMerge ? t('rollback.revert.mergeDescription') : t('rollback.revert.description')}
          </DialogDescription>
        </DialogHeader>

        {isMerge && (
          <div className="space-y-2" data-testid="revert-mainline-picker">
            <p className="text-xs text-muted-foreground">{t('rollback.revert.mainlineLabel')}</p>
            <RadioGroup
              name="revert-mainline"
              value={String(mainline)}
              onValueChange={(value) => setMainline(Number(value))}
            >
              {parents.map((parent, index) => {
                const parentNumber = index + 1
                return (
                  <label
                    key={parent.oid}
                    data-testid={`revert-mainline-option-${parentNumber}`}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm transition-colors ${
                      mainline === parentNumber
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <RadioGroupItem value={String(parentNumber)} />
                    <span className="min-w-0 flex-1 truncate">
                      {t('rollback.revert.mainlineOption', {
                        parent: parentNumber,
                        sha: parent.shortOid,
                        subject: parent.subject,
                      })}
                    </span>
                  </label>
                )
              })}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {t('rollback.revert.mainlineHint', { parent: mainline })}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 py-2">
          <Checkbox
            id="no-commit"
            checked={noCommit}
            onChange={(e) => setNoCommit(e.target.checked)}
          />
          <label htmlFor="no-commit" className="cursor-pointer text-sm text-foreground">
            {t('rollback.revert.noCommit')}
          </label>
        </div>

        {error && (
          <p className="rounded bg-destructive/20 px-3 py-2 text-xs text-destructive">{error}</p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={isLoading}
            data-testid="revert-confirm-button"
          >
            {isLoading && <Spinner className="mr-1 h-3 w-3" />}
            {t('rollback.revert.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
