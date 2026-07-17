import { useState, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import type { GitBranch } from '@git-manager/git-types'
import { GitBranch as BranchIcon } from 'lucide-react'
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
import { apiDeleteBranch, apiFetchRemote } from '../../api/git.api'
import { apiGoneUpstreamBranches } from '../../api/worktree.api'
import { DEFAULT_PINNED } from './types'

interface PruneBranchesDialogProps {
  repoPath: string
  /** All local branches — the prunable subset is computed inside from the gone-upstream signal. */
  branches: GitBranch[]
  /** Branch names checked out in a linked worktree (git refuses to delete those). */
  worktreeBranches: string[]
  open: boolean
  onClose: () => void
}

/** Bulk-deletes local branches whose upstream remote branch is gone — the remote branch was deleted
 * (e.g. after its PR merged) and pruned locally, so the branch is a stale leftover. The quick,
 * GitHub-independent counterpart of `RemoveMergedBranchesDialog`. Excludes the current HEAD,
 * main/master, and branches checked out in a worktree; deletion runs through `apiDeleteBranch`
 * WITHOUT `force`, so the backend's "merged into HEAD" guard still refuses anything unmerged. */
export function PruneBranchesDialog({
  repoPath,
  branches,
  worktreeBranches,
  open,
  onClose,
}: PruneBranchesDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [failedNames, setFailedNames] = useState<string[]>([])
  const [removedNames, setRemovedNames] = useState<string[]>([])

  const worktreeSet = new Set(worktreeBranches)
  const [gone, setGone] = useState<string[] | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)

  // On open, refresh the remote-tracking refs with a prune first: a merged branch's
  // `origin/<name>` is only dropped by `git fetch --prune`, and until then the branch never shows
  // up as "gone". Best-effort — an offline/auth failure just falls back to whatever's already
  // pruned locally, with a hint so an empty list isn't mistaken for "nothing merged".
  useEffect(() => {
    if (!open) {
      setGone(null)
      setFetchFailed(false)
      return
    }
    let cancelled = false
    setIsChecking(true)
    setFetchFailed(false)
    void (async () => {
      const fetchedOk = await apiFetchRemote(repoPath, undefined, true).then(
        () => true,
        () => false
      )
      const list = await apiGoneUpstreamBranches(repoPath).catch(() => [] as string[])
      if (!cancelled) {
        setGone(list)
        setFetchFailed(!fetchedOk)
        setIsChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, repoPath])

  const goneSet = gone ? new Set(gone) : null

  const prunable = (
    goneSet
      ? branches.filter(
          (b) =>
            !b.isRemote &&
            !b.isHead &&
            !DEFAULT_PINNED.includes(b.shortName) &&
            !worktreeSet.has(b.shortName) &&
            goneSet.has(b.shortName)
        )
      : []
  ).filter((b) => !removedNames.includes(b.shortName))

  async function handleConfirm() {
    setIsLoading(true)
    setFailedNames([])
    const succeeded: string[] = []
    const stillFailing: string[] = []
    for (const b of prunable) {
      try {
        await apiDeleteBranch(repoPath, b.shortName, {
          targetOid: b.commitOid,
          upstream: b.upstream ?? undefined,
        })
        succeeded.push(b.shortName)
      } catch {
        stillFailing.push(b.shortName)
      }
    }
    queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
    setIsLoading(false)
    setRemovedNames((prev) => [...prev, ...succeeded])
    if (stillFailing.length > 0) {
      setFailedNames(stillFailing)
      return
    }
    handleClose()
  }

  function handleClose() {
    setFailedNames([])
    setRemovedNames([])
    onClose()
  }

  function handleOpenChange(next: boolean) {
    if (!next) handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="branch-prune-dialog">
        <DialogHeader>
          <DialogTitle>{t('branch.prune')}</DialogTitle>
          <DialogDescription>
            {isChecking
              ? t('branch.pruneChecking')
              : prunable.length === 0
                ? t('branch.pruneEmpty')
                : t('branch.pruneDescription', { count: prunable.length })}
          </DialogDescription>
        </DialogHeader>

        {!isChecking && fetchFailed && (
          <p
            className="text-[11px] text-muted-foreground/70"
            data-testid="branch-prune-fetch-failed-hint"
          >
            {t('branch.pruneFetchFailed')}
          </p>
        )}

        {prunable.length > 0 && (
          <ul className="max-h-52 space-y-1 overflow-y-auto py-1 text-xs text-muted-foreground">
            {prunable.map((b) => (
              <li
                key={b.shortName}
                className="flex items-center gap-1.5"
                data-testid={`branch-prune-item-${b.shortName}`}
              >
                <BranchIcon className="h-3 w-3 shrink-0 opacity-50" />
                <span className="min-w-0 flex-1 truncate">{b.shortName}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                  {b.commitOid.slice(0, 7)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {failedNames.length > 0 && (
          <p className="text-xs text-destructive">
            {t('branch.prunePartialFailure', { names: failedNames.join(', ') })}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={isLoading}>
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={isLoading || isChecking || prunable.length === 0}
            className="gap-1.5"
            data-testid="branch-prune-confirm-button"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('branch.prune')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
