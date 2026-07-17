import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { GitWorktree, WorktreeAddResult } from '@git-manager/git-types'
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
import { FolderOpen, Save } from 'lucide-react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useBranches } from '../../hooks/useBranches'
import { useCanonicalRepoPath } from '../../hooks/useCanonicalRepoPath'
import { useDefaultFileMatchCounts } from '../../hooks/useDefaultFileMatchCounts'
import { useEffectiveRepoSettings } from '../../hooks/useEffectiveRepoSettings'
import { useSettingsStore } from '../../stores/settings.store'
import { apiAddWorktree, apiListWorktrees } from '../../api/worktree.api'
import { DefaultFilesEditor } from '../worktree/DefaultFilesEditor'
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
 * creation. A right-hand panel lists the "default files" (gitignored locals like `.env`) copied into
 * the new worktree; it's seeded from the repo's saved defaults but edits there are transient unless
 * explicitly saved back. */
export function AddWorktreeDialog({ repoPath, open, onClose }: AddWorktreeDialogProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const { data: allBranches = [] } = useBranches(repoPath)
  const effective = useEffectiveRepoSettings(repoPath)
  // Default files are a per-repo setting: seed reads and "save as default" writes from the owning
  // repo (main worktree), so every worktree shares one list rather than its own.
  const settingsRepo = useCanonicalRepoPath(repoPath) ?? repoPath
  const setRepoSetting = useSettingsStore((s) => s.setRepoSetting)
  const resetRepoSetting = useSettingsStore((s) => s.resetRepoSetting)
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
  const [defaultFiles, setDefaultFiles] = useState<string[]>([])
  // Once the user relocates the destination (typed it or picked a folder), stop re-deriving it
  // from the branch so their choice isn't clobbered when the selection changes.
  const [pathEdited, setPathEdited] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WorktreeAddResult | null>(null)
  // Live "N files" hint per pattern, counted against the copy source (`repoPath`) — only while the
  // dialog is open (and not showing the result summary).
  const matchCounts = useDefaultFileMatchCounts(open && !result ? repoPath : null, defaultFiles)

  const branchInUse = !!branch && checkedOutBranches.has(branch)

  // Seed the transient file list from the repo's saved defaults each time the dialog opens, so
  // per-creation edits never leak between openings and always start from the current defaults.
  useEffect(() => {
    if (open) {
      setDefaultFiles(effective.worktreeDefaultFiles)
      setResult(null)
    }
    // Depend only on `open`: re-seeding on every `effective` change would clobber in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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

  // The current list differs from what's saved for the repo — enables "Save as project default".
  const savedFiles = effective.worktreeDefaultFiles
  const cleanedFiles = defaultFiles.map((f) => f.trim()).filter(Boolean)
  const dirtyDefaults =
    cleanedFiles.length !== savedFiles.length || cleanedFiles.some((f, i) => f !== savedFiles[i])
  // Don't persist a pattern that matches no files (keeps saved defaults free of dead patterns). A
  // pattern whose count hasn't resolved yet also blocks, so we never save an unverified one.
  const allDefaultsMatch = cleanedFiles.every((f) => (matchCounts[f] ?? 0) > 0)
  const canSaveDefaults = dirtyDefaults && (cleanedFiles.length === 0 || allDefaultsMatch)

  function saveAsProjectDefault() {
    if (cleanedFiles.length === 0) {
      resetRepoSetting(settingsRepo, 'worktreeDefaultFiles')
    } else {
      setRepoSetting(settingsRepo, 'worktreeDefaultFiles', cleanedFiles)
    }
  }

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
      const res = await apiAddWorktree(repoPath, branch, trimmed, cleanedFiles)
      queryClient.invalidateQueries({ queryKey: ['worktrees', repoPath] })
      // With default files requested, keep the dialog open to report the copy summary; otherwise
      // close immediately as before.
      if (cleanedFiles.length > 0) {
        setResult(res)
        resetForm()
      } else {
        resetForm()
        onClose()
      }
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
      <DialogContent data-testid="worktree-add-dialog" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('worktree.add')}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-1" data-testid="worktree-add-result">
            <p className="text-sm text-foreground">
              {t('worktree.defaultFiles.copiedSummary', {
                copied: result.copied.length,
                skipped: result.skipped.length,
              })}
            </p>
            {result.skipped.length > 0 && (
              <ul
                className="list-inside list-disc font-mono text-[11px] text-muted-foreground"
                data-testid="worktree-add-skipped"
              >
                {result.skipped.map((pattern) => (
                  <li key={pattern}>{pattern}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 py-1 sm:grid-cols-2">
            {/* Left: branch + destination path */}
            <div className="space-y-3">
              {localBranches.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('worktree.addNoBranches')}</p>
              ) : (
                <>
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
                </>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            {/* Right: default files panel */}
            <div className="space-y-2 border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">
                  {t('worktree.defaultFiles.title')}
                </span>
                <button
                  type="button"
                  data-testid="worktree-default-files-save"
                  disabled={!canSaveDefaults}
                  onClick={saveAsProjectDefault}
                  className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-40"
                >
                  <Save className="h-3 w-3" />
                  {t('worktree.defaultFiles.saveAsDefault')}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('worktree.defaultFiles.helper')}
              </p>
              <DefaultFilesEditor
                patterns={defaultFiles}
                matchCounts={matchCounts}
                onChange={setDefaultFiles}
                disabled={isLoading}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button size="sm" onClick={onClose} data-testid="worktree-add-done-button">
              {t('worktree.defaultFiles.done')}
            </Button>
          ) : (
            <>
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
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
