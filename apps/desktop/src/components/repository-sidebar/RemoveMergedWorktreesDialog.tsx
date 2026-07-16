import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import type { GitWorktree } from '@git-manager/git-types'
import { CheckCircle2, AlertTriangle, GitBranch, CircleDashed, Layers, Copy } from 'lucide-react'
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
import { apiRemoveWorktree } from '../../api/worktree.api'
import { copyWithToast } from '../../lib/clipboard'
import { useMergedWorktrees, type WorktreeMergeStatus } from '../../hooks/useMergedWorktrees'

interface RemoveMergedWorktreesDialogProps {
  repoPath: string
  /** All non-main worktrees — merge-status filtering happens inside via useMergedWorktrees. */
  worktrees: GitWorktree[]
  remoteUrls: string[]
  githubToken?: string
  open: boolean
  onClose: () => void
}

type TranslateFn = ReturnType<typeof useTranslation>['t']

/** Eligibility icon shown on the card's right edge — a green check when the worktree qualifies
 * (with the merge detail as a tooltip), a spinner while checking, a warning otherwise. */
function StatusIcon({ status, t }: { status: WorktreeMergeStatus; t: TranslateFn }) {
  if (typeof status === 'object') {
    return (
      <span title={t('worktree.removeMergedStatusMerged', { number: status.merged.number })}>
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      </span>
    )
  }
  switch (status) {
    case 'branch-gone':
      return (
        <span title={t('worktree.removeMergedStatusBranchGone')}>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </span>
      )
    case 'checking':
      return (
        <span title={t('worktree.removeMergedStatusChecking')}>
          <Spinner className="h-4 w-4 text-muted-foreground" />
        </span>
      )
    case 'dirty':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />
    case 'detached':
      return <GitBranch className="h-4 w-4 text-muted-foreground" />
    case 'no-match':
      return <CircleDashed className="h-4 w-4 text-muted-foreground" />
  }
}

/** Why the worktree is NOT eligible, spelled out under the card — null for eligible/checking
 * ones, whose green check / spinner needs no extra explanation. */
function statusReason(status: WorktreeMergeStatus, t: TranslateFn): string | null {
  switch (status) {
    case 'dirty':
      return t('worktree.removeMergedStatusDirty')
    case 'detached':
      return t('worktree.removeMergedStatusDetached')
    case 'no-match':
      return t('worktree.removeMergedStatusNoMatch')
    default:
      return null
  }
}

/** Bulk-deletes worktrees (folder + metadata, via `apiRemoveWorktree` once per worktree) whose
 * branch is confirmed merged via a GitHub pull request, and which have no uncommitted changes.
 * Distinct from `PruneWorktreesDialog`, which only ever touches worktrees whose folder is already
 * gone from disk — this one deletes folders that still exist.
 *
 * Every worktree passed in is listed with its own status (dirty / detached / no matching PR /
 * merged), not just the ones that qualify — three prior attempts at guessing why a worktree wasn't
 * showing up as removable (wrong GitHub API endpoint, wrong repo assumption, etc.) all turned out
 * to need this kind of visibility to actually diagnose, so it's built in rather than left opaque. */
export function RemoveMergedWorktreesDialog({
  repoPath,
  worktrees,
  remoteUrls,
  githubToken,
  open,
  onClose,
}: RemoveMergedWorktreesDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [failedPaths, setFailedPaths] = useState<string[]>([])
  const [removedPaths, setRemovedPaths] = useState<string[]>([])

  const { checks, mergedWorktrees, isLoading: isChecking, isGithub, hasToken } = useMergedWorktrees(
    repoPath,
    worktrees,
    remoteUrls,
    githubToken,
    open
  )

  const candidates = mergedWorktrees.filter((wt) => !removedPaths.includes(wt.path))
  const visibleChecks = checks.filter((c) => !removedPaths.includes(c.worktree.path))

  async function handleConfirm() {
    setIsLoading(true)
    setFailedPaths([])
    const succeeded: string[] = []
    const stillFailing: string[] = []
    for (const wt of candidates) {
      try {
        await apiRemoveWorktree(repoPath, wt.path)
        succeeded.push(wt.path)
      } catch {
        stillFailing.push(wt.path)
      }
    }
    queryClient.invalidateQueries({ queryKey: ['worktrees', repoPath] })
    setIsLoading(false)
    setRemovedPaths((prev) => [...prev, ...succeeded])
    if (stillFailing.length > 0) {
      setFailedPaths(stillFailing)
      return
    }
    handleClose()
  }

  function handleClose() {
    setFailedPaths([])
    setRemovedPaths([])
    onClose()
  }

  function handleOpenChange(next: boolean) {
    if (!next) handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="worktree-remove-merged-dialog">
        <DialogHeader>
          <DialogTitle>{t('worktree.removeMerged')}</DialogTitle>
          <DialogDescription>
            {isChecking
              ? t('worktree.removeMergedChecking')
              : candidates.length === 0
                ? t('worktree.removeMergedEmpty')
                : t('worktree.removeMergedDescription', { count: candidates.length })}
          </DialogDescription>
        </DialogHeader>

        {/* GitHub is optional — the local "merged into main" signal works without it. When it's
            unavailable we just note that PR detection is off, rather than blocking the whole flow. */}
        {(!isGithub || !hasToken) && (
          <p className="text-[11px] text-muted-foreground/70" data-testid="worktree-remove-merged-github-hint">
            {!isGithub
              ? t('worktree.removeMergedNoGithubRemote')
              : t('worktree.removeMergedNoToken')}
          </p>
        )}

        {visibleChecks.length > 0 && (
          <ul className="max-h-60 space-y-1.5 overflow-y-auto py-1">
            {visibleChecks.map(({ worktree: wt, status }) => {
              const reason = statusReason(status, t)
              return (
                <li
                  key={wt.path}
                  className="rounded-md border border-border/50 bg-muted/20 px-3 py-2"
                  data-testid={`worktree-remove-merged-item-${wt.path}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0">
                      <StatusIcon status={status} t={t} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                        title={wt.branch}
                      >
                        <Layers className="h-3 w-3 shrink-0 opacity-50" />
                        <span className="truncate">{wt.branch}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => copyWithToast(wt.path, 'Path')}
                        className="mt-1 flex max-w-full items-center gap-1 rounded border border-border/40 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title={wt.path}
                        aria-label="Copy path"
                        data-testid={`worktree-remove-merged-copy-path-${wt.path}`}
                      >
                        <span className="truncate">{wt.path}</span>
                        <Copy className="h-2.5 w-2.5 shrink-0" />
                      </button>
                      {reason && (
                        <p
                          className={`text-[10px] ${
                            status === 'dirty' ? 'text-amber-500' : 'text-muted-foreground'
                          }`}
                          data-testid={`worktree-remove-merged-reason-${wt.path}`}
                        >
                          {reason}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {failedPaths.length > 0 && (
          <p className="text-xs text-destructive">
            {t('worktree.removeMergedPartialFailure', { paths: failedPaths.join(', ') })}
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
            disabled={isLoading || isChecking || candidates.length === 0}
            className="gap-1.5"
            data-testid="worktree-remove-merged-confirm-button"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('worktree.removeMerged')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
