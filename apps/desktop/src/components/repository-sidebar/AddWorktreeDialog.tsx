import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { GitWorktree } from '@git-manager/git-types'
import { FolderOpen } from 'lucide-react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
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
import { BranchCombobox } from './BranchCombobox'
import { defaultWorktreePath, worktreePathInParent } from './worktreePath'

interface AddWorktreeDialogProps {
  repoPath: string
  open: boolean
  onClose: () => void
}

/** Creates a new linked worktree. The base branch is picked from a searchable dropdown (defaulting
 * to the current branch); the destination path defaults to a sibling `<project>.worktrees/<branch>`
 * folder and can be relocated with a native folder picker. A branch already checked out by any
 * worktree can't be checked out again, so selecting one surfaces an inline warning and blocks
 * creation rather than letting `add_worktree` fail. */
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
  const checkedOutBranches = new Set(worktrees.map((wt) => wt.branch))
  // Anchor the default destination on the MAIN worktree's root, not `repoPath` — the active tab may
  // itself be a linked worktree, and nesting new worktrees inside it is exactly the wrong place.
  const repoRoot = worktrees.find((wt) => wt.isMain)?.path ?? repoPath
  const localBranches = allBranches.filter((b) => !b.isRemote)
  const branchOptions = localBranches.map((b) => ({
    shortName: b.shortName,
    isCheckedOut: checkedOutBranches.has(b.shortName),
  }))

  const [branch, setBranch] = useState('')
  const [path, setPath] = useState('')
  // Once the user relocates the destination (typed it or picked a folder), stop re-deriving it
  // from the branch so their choice isn't clobbered when the selection changes.
  const [pathEdited, setPathEdited] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const branchInUse = !!branch && checkedOutBranches.has(branch)

  // Default the selection to the current branch (falling back to the first local branch). Re-runs
  // whenever the branch list changes — the branches query commonly resolves after the first render —
  // so the default lands once the real list arrives, but leaves an explicit user choice alone.
  useEffect(() => {
    if (!open || localBranches.length === 0) return
    if (branch && localBranches.some((b) => b.shortName === branch)) return
    const head = localBranches.find((b) => b.isHead)
    setBranch(head?.shortName ?? localBranches[0].shortName)
  }, [open, localBranches, branch])

  // Keep the destination in sync with the selected branch until the user takes it over.
  useEffect(() => {
    if (!open || pathEdited || !branch) return
    setPath(defaultWorktreePath(repoRoot, branch))
  }, [open, pathEdited, branch, repoRoot])

  async function pickParentDir() {
    const selected = await openDialog({ directory: true, multiple: false })
    if (selected && typeof selected === 'string') {
      setPath(worktreePathInParent(selected, branch))
      setPathEdited(true)
    }
  }

  async function handleConfirm() {
    const trimmed = path.trim()
    if (!trimmed || !branch || branchInUse) return
    setIsLoading(true)
    setError(null)
    try {
      await apiAddWorktree(repoPath, branch, trimmed)
      queryClient.invalidateQueries({ queryKey: ['worktrees', repoPath] })
      resetForm()
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  function resetForm() {
    setPath('')
    setBranch('')
    setPathEdited(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null)
      resetForm()
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
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">
                {t('worktree.addBranchLabel')}
              </label>
              <BranchCombobox
                branches={branchOptions}
                value={branch}
                onChange={setBranch}
                placeholder={t('worktree.addBranchPlaceholder')}
                searchPlaceholder={t('worktree.addBranchSearchPlaceholder')}
                emptyLabel={t('worktree.addBranchEmpty')}
                inUseLabel={t('worktree.addBranchInUse')}
              />
              {branchInUse && (
                <p
                  className="text-xs text-destructive"
                  data-testid="worktree-add-branch-in-use-warning"
                >
                  {t('worktree.addBranchCheckedOutWarning')}
                </p>
              )}
            </div>
          )}

          {localBranches.length > 0 && (
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">
                {t('worktree.addPathLabel')}
              </label>
              <div className="flex gap-2">
                <Input
                  value={path}
                  onChange={(e) => {
                    setPath(e.target.value)
                    setPathEdited(true)
                  }}
                  placeholder={t('worktree.addPathPlaceholder')}
                  data-testid="worktree-add-path-input"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirm()
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={pickParentDir}
                  aria-label={t('worktree.addPathBrowse')}
                  data-testid="worktree-add-path-browse"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!path.trim() || !branch || branchInUse || isLoading}
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
