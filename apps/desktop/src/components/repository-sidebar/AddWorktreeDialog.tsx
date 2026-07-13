import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { GitWorktree } from '@git-manager/git-types'
import {
  Button,
  Spinner,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@git-manager/ui'
import { useBranches } from '../../hooks/useBranches'
import { apiAddWorktree, apiListWorktrees } from '../../api/worktree.api'

interface AddWorktreeDialogProps {
  repoPath: string
  open: boolean
  onClose: () => void
}

/** Creates a new linked worktree — a plain path input, not a native folder picker, since the
 * destination must NOT already exist (`add_worktree` errors otherwise). */
export function AddWorktreeDialog({ repoPath, open, onClose }: AddWorktreeDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const { data: allBranches = [] } = useBranches(repoPath)
  // Same query key as useSidebarRows.ts's worktrees query — shares its cache, no extra fetch.
  const { data: worktrees = [] } = useQuery<GitWorktree[]>({
    queryKey: ['worktrees', repoPath],
    queryFn: () => apiListWorktrees(repoPath),
    enabled: !!repoPath,
  })
  // A branch already checked out in ANY worktree (the main one included) can't be checked out
  // again — `git worktree add` refuses with "'<branch>' is already used by worktree at '<path>'".
  // Excluding those from the picker (not just the default) avoids that error entirely rather than
  // just avoiding it for the common case.
  const checkedOutBranches = new Set(worktrees.map((wt) => wt.branch))
  const localBranches = allBranches.filter(
    (b) => !b.isRemote && !checkedOutBranches.has(b.shortName)
  )
  const [branch, setBranch] = useState('')
  const [path, setPath] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-validates (not just initializes) the selection whenever the filtered list changes: the
  // branches query commonly resolves before the worktrees query does, so the first pass here can
  // run against an unfiltered `localBranches` and default to a branch that's actually already
  // checked out (e.g. HEAD). Re-running whenever `localBranches` changes — rather than only once,
  // guarded by "branch already set" — corrects that once the real, filtered list arrives instead of
  // leaving a stale, invalid selection in place.
  useEffect(() => {
    if (!open || localBranches.length === 0) return
    if (branch && localBranches.some((b) => b.shortName === branch)) return
    setBranch(localBranches[0].shortName)
  }, [open, localBranches, branch])

  async function handleConfirm() {
    const trimmed = path.trim()
    if (!trimmed || !branch) return
    setIsLoading(true)
    setError(null)
    try {
      await apiAddWorktree(repoPath, branch, trimmed)
      queryClient.invalidateQueries({ queryKey: ['worktrees', repoPath] })
      setPath('')
      setBranch('')
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
      <DialogContent data-testid="worktree-add-dialog">
        <DialogHeader>
          <DialogTitle>{t('worktree.add')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {localBranches.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('worktree.addNoBranches')}</p>
          ) : (
            <label className="block space-y-1 text-xs text-muted-foreground">
              {t('worktree.addBranchLabel')}
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                data-testid="worktree-add-branch-select"
              >
                {localBranches.map((b) => (
                  <option key={b.name} value={b.shortName}>
                    {b.shortName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Input
            autoFocus
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={t('worktree.addPathPlaceholder')}
            data-testid="worktree-add-path-input"
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
            disabled={!path.trim() || !branch || isLoading}
            className="gap-1.5"
            data-testid="worktree-add-confirm-button"
          >
            {isLoading && <Spinner className="h-3 w-3" />}
            {t('gitTree.contextMenu.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
