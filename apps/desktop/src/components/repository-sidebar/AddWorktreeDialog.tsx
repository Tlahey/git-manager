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
import { Save } from 'lucide-react'
import { useBranches } from '../../hooks/useBranches'
import { useCanonicalRepoPath } from '../../hooks/useCanonicalRepoPath'
import { useDefaultFileMatchCounts } from '../../hooks/useDefaultFileMatchCounts'
import { useEffectiveRepoSettings } from '../../hooks/useEffectiveRepoSettings'
import { useSettingsStore } from '../../stores/settings.store'
import { apiAddWorktree, apiListWorktrees } from '../../api/worktree.api'
import { DefaultFilesEditor } from '../worktree/DefaultFilesEditor'

interface AddWorktreeDialogProps {
  repoPath: string
  open: boolean
  onClose: () => void
}

/** Creates a new linked worktree — a plain path input, not a native folder picker, since the
 * destination must NOT already exist (`add_worktree` errors otherwise). A right-hand panel lists
 * the "default files" (gitignored locals like `.env`) copied into the new worktree; it's seeded
 * from the repo's saved defaults but edits there are transient unless explicitly saved back. */
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
  // Excluding those from the picker (not just the default) avoids that error entirely rather than
  // just avoiding it for the common case.
  const checkedOutBranches = new Set(worktrees.map((wt) => wt.branch))
  const localBranches = allBranches.filter(
    (b) => !b.isRemote && !checkedOutBranches.has(b.shortName)
  )
  const [branch, setBranch] = useState('')
  const [path, setPath] = useState('')
  const [defaultFiles, setDefaultFiles] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WorktreeAddResult | null>(null)
  // Live "N files" hint per pattern, counted against the copy source (`repoPath`) — only while the
  // dialog is open (and not showing the result summary).
  const matchCounts = useDefaultFileMatchCounts(open && !result ? repoPath : null, defaultFiles)

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

  // The current list differs from what's saved for the repo — enables "Save as project default".
  const savedFiles = effective.worktreeDefaultFiles
  const cleanedFiles = defaultFiles.map((f) => f.trim()).filter(Boolean)
  const dirtyDefaults =
    cleanedFiles.length !== savedFiles.length ||
    cleanedFiles.some((f, i) => f !== savedFiles[i])
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

  async function handleConfirm() {
    const trimmed = path.trim()
    if (!trimmed || !branch) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiAddWorktree(repoPath, branch, trimmed, cleanedFiles)
      queryClient.invalidateQueries({ queryKey: ['worktrees', repoPath] })
      // With default files requested, keep the dialog open to report the copy summary; otherwise
      // close immediately as before.
      if (cleanedFiles.length > 0) {
        setResult(res)
        setPath('')
        setBranch('')
      } else {
        setPath('')
        setBranch('')
        onClose()
      }
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
              <p className="text-[11px] text-muted-foreground">{t('worktree.defaultFiles.helper')}</p>
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
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
