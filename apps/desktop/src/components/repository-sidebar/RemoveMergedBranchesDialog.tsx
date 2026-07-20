import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import type { GitBranch } from '@git-manager/git-types'
import { CheckCircle2, GitBranch as BranchIcon, CircleDashed, Layers, Copy } from 'lucide-react'
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
import { apiDeleteBranch } from '../../api/git.api'
import { copyWithToast } from '../../lib/clipboard'
import { useMergedBranches, type BranchMergeStatus } from '../../hooks/useMergedBranches'

interface RemoveMergedBranchesDialogProps {
  repoPath: string
  /** All local branches — protection/merge filtering happens inside via useMergedBranches. */
  branches: GitBranch[]
  /** Branch names currently checked out in a linked worktree (git refuses to delete those). */
  worktreeBranches: string[]
  remoteUrls: string[]
  githubToken?: string
  /** When set, only branches whose merged PR was authored by `currentUser` are offered. */
  mineOnly?: boolean
  currentUser?: string
  open: boolean
  onClose: () => void
}

type TranslateFn = ReturnType<typeof useTranslation>['t']

/** Eligibility icon on the card's left edge — a green check when the branch qualifies (with the
 * merge detail as a tooltip), a spinner while checking, a neutral marker otherwise. */
function StatusIcon({ status, t }: { status: BranchMergeStatus; t: TranslateFn }) {
  if (typeof status === 'object') {
    return (
      <span title={t('branch.removeMergedStatusMerged', { number: status.merged.number })}>
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      </span>
    )
  }
  switch (status) {
    case 'branch-gone':
      return (
        <span title={t('branch.removeMergedStatusBranchGone')}>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </span>
      )
    case 'checking':
      return (
        <span title={t('branch.removeMergedStatusChecking')}>
          <Spinner className="h-4 w-4 text-muted-foreground" />
        </span>
      )
    case 'worktree':
      return <Layers className="h-4 w-4 text-muted-foreground" />
    case 'no-match':
      return <CircleDashed className="h-4 w-4 text-muted-foreground" />
  }
}

/** Why the branch is NOT eligible, spelled out under the card — null for eligible/checking ones. */
function statusReason(status: BranchMergeStatus, t: TranslateFn): string | null {
  switch (status) {
    case 'worktree':
      return t('branch.removeMergedStatusWorktree')
    case 'no-match':
      return t('branch.removeMergedStatusNoMatch')
    default:
      return null
  }
}

/** Bulk-deletes local branches detected as merged (via a same-branch merged PR, a gone upstream, or
 * a closed-PR name match), excluding the current HEAD, main/master, and branches checked out in a
 * worktree. Deletion runs through `apiDeleteBranch` WITHOUT `force`, so the backend's own "merged
 * into HEAD" guard is a second gate — a false-positive signal here can't delete an unmerged branch,
 * it just fails and stays listed. Every candidate branch is shown with its status for transparency. */
export function RemoveMergedBranchesDialog({
  repoPath,
  branches,
  worktreeBranches,
  remoteUrls,
  githubToken,
  mineOnly = false,
  currentUser,
  open,
  onClose,
}: RemoveMergedBranchesDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [failedNames, setFailedNames] = useState<string[]>([])
  const [removedNames, setRemovedNames] = useState<string[]>([])

  const { checks, isLoading: isChecking, isGithub, hasToken } = useMergedBranches(
    repoPath,
    branches,
    worktreeBranches,
    remoteUrls,
    githubToken,
    open
  )

  // "Mine" = the merged PR was authored by the signed-in GitHub user. Only PR-detected branches
  // carry an author, so in mine-mode gone-upstream-only ones (no PR) are never offered.
  const isMine = (status: BranchMergeStatus): boolean =>
    typeof status === 'object' &&
    !!currentUser &&
    status.merged.author?.toLowerCase() === currentUser.toLowerCase()
  const inScope = (status: BranchMergeStatus) => (mineOnly ? isMine(status) : true)

  const candidates = checks
    .filter(
      (c) =>
        !removedNames.includes(c.branch.shortName) &&
        (typeof c.status === 'object' || c.status === 'branch-gone') &&
        inScope(c.status)
    )
    .map((c) => c.branch)
  const visibleChecks = checks.filter(
    (c) => !removedNames.includes(c.branch.shortName) && inScope(c.status)
  )

  async function handleConfirm() {
    setIsLoading(true)
    setFailedNames([])
    const succeeded: string[] = []
    const stillFailing: string[] = []
    for (const b of candidates) {
      try {
        // No `force`: the backend refuses branches not merged into HEAD, a safety net beyond our
        // detection — so an over-eager signal fails here rather than deleting unmerged work.
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
      <DialogContent data-testid="branch-remove-merged-dialog">
        <DialogHeader>
          <DialogTitle>{t(mineOnly ? 'branch.removeMyMerged' : 'branch.removeMerged')}</DialogTitle>
          <DialogDescription>
            {isChecking
              ? t('branch.removeMergedChecking')
              : candidates.length === 0
                ? t('branch.removeMergedEmpty')
                : t('branch.removeMergedDescription', { count: candidates.length })}
          </DialogDescription>
        </DialogHeader>

        {(!isGithub || !hasToken) && (
          <p
            className="text-[11px] text-muted-foreground/70"
            data-testid="branch-remove-merged-github-hint"
          >
            {!isGithub
              ? t('branch.removeMergedNoGithubRemote')
              : t('branch.removeMergedNoToken')}
          </p>
        )}

        {visibleChecks.length > 0 && (
          <ul className="max-h-60 space-y-1.5 overflow-y-auto py-1">
            {visibleChecks.map(({ branch: b, status }) => {
              const reason = statusReason(status, t)
              return (
                <li
                  key={b.shortName}
                  className="rounded-md border border-border/50 bg-muted/20 px-3 py-2"
                  data-testid={`branch-remove-merged-item-${b.shortName}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0">
                      <StatusIcon status={status} t={t} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                        title={b.shortName}
                      >
                        <BranchIcon className="h-3 w-3 shrink-0 opacity-50" />
                        <span className="truncate">{b.shortName}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => copyWithToast(b.commitOid, 'SHA')}
                        className="mt-1 flex items-center gap-1 rounded border border-border/40 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title={b.commitOid}
                        aria-label={t('sidebar.copySha')}
                        data-testid={`branch-remove-merged-copy-sha-${b.shortName}`}
                      >
                        <span className="truncate">{b.commitOid.slice(0, 7)}</span>
                        <Copy className="h-2.5 w-2.5 shrink-0" />
                      </button>
                      {reason && (
                        <p
                          className="text-[10px] text-muted-foreground"
                          data-testid={`branch-remove-merged-reason-${b.shortName}`}
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
        {failedNames.length > 0 && (
          <p className="text-xs text-destructive">
            {t('branch.removeMergedPartialFailure', { names: failedNames.join(', ') })}
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
            data-testid="branch-remove-merged-confirm-button"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t(mineOnly ? 'branch.removeMyMerged' : 'branch.removeMerged')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
