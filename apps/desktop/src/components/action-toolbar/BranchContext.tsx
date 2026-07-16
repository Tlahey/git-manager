import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, GitBranch, Layers, Search, X } from 'lucide-react'
import { Spinner, Popover, PopoverTrigger, PopoverContent } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { GitWorktree } from '@git-manager/git-types'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useBranches } from '../../hooks/useBranches'
import { apiCheckoutBranch } from '../../api/git.api'
import { apiOpenRepo } from '../../api/repo.api'
import { apiListWorktrees } from '../../api/worktree.api'

type ContextEntry =
  | { kind: 'workspace'; key: string; label: string; path: string }
  | { kind: 'branch'; key: string; label: string; name: string }

/** Selector merging the current branch/workspace context with both switch targets: pick a local
 * branch (checks it out, on `activeRepo`) or a linked worktree ("workspace" — a view switch onto
 * that worktree's own data, no tab change, no checkout — see repoUI.store.ts's
 * `activeWorkspacePath`). The list is ordered current → workspaces → branches, each icon-tagged. */
export function BranchContext() {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const { activeRepo, activeWorkspacePath } = useRepoUIStore()
  const setActiveWorkspacePath = useRepoUIStore((s) => s.setActiveWorkspacePath)
  const { repoCache, setRepoCache } = useRepoDataStore()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 3000)
    return () => clearTimeout(id)
  }, [error])

  const repo = activeRepo ? repoCache[activeRepo] : undefined
  const { data: branches = [] } = useBranches(activeRepo ?? '')
  // Same query key as useSidebarRows.ts/AddWorktreeDialog.tsx's worktrees query — shares cache.
  const { data: worktrees = [] } = useQuery<GitWorktree[]>({
    queryKey: ['worktrees', activeRepo],
    queryFn: () => apiListWorktrees(activeRepo as string),
    enabled: !!activeRepo,
  })

  const locals = useMemo(() => branches.filter((b) => !b.isRemote), [branches])
  const headBranch = useMemo(() => locals.find((b) => b.isHead), [locals])
  const activeWorkspace = useMemo(
    () => worktrees.find((wt) => wt.path === activeWorkspacePath),
    [worktrees, activeWorkspacePath]
  )

  if (!activeRepo) return null

  // La branche/workspace affiché(e) vient en priorité du log des branches (toujours à jour après
  // un checkout) / de la liste des worktrees, avec repli sur le cache repo (head / detached).
  const branchLabel =
    headBranch?.shortName ?? (repo?.isDetached ? repo.head.slice(0, 10) : (repo?.head ?? '—'))
  const currentLabel = activeWorkspacePath ? (activeWorkspace?.branch ?? '—') : branchLabel

  const q = query.trim().toLowerCase()
  const matchesQuery = (label: string) => !q || label.toLowerCase().includes(q)

  const entries: ContextEntry[] = [
    ...worktrees
      .filter(
        (wt) =>
          !wt.isMain &&
          wt.branch !== '(detached HEAD)' &&
          wt.path !== activeWorkspacePath &&
          matchesQuery(wt.branch)
      )
      .map((wt): ContextEntry => ({ kind: 'workspace', key: wt.path, label: wt.branch, path: wt.path })),
    ...locals
      .filter((b) => (activeWorkspacePath ? true : !b.isHead) && matchesQuery(b.shortName))
      .map((b): ContextEntry => ({ kind: 'branch', key: b.name, label: b.shortName, name: b.shortName })),
  ]
  const showCurrentRow = matchesQuery(currentLabel)

  function handleOpenWorkspace(path: string) {
    setActiveWorkspacePath(path)
    setOpen(false)
    setQuery('')
  }

  async function handleCheckout(name: string) {
    if (!activeRepo || busy) return
    setBusy(name)
    try {
      const fromDetached = repo?.isDetached ?? false
      const fromRef = fromDetached ? repo!.head : (headBranch?.shortName ?? repo?.head)
      await apiCheckoutBranch(activeRepo, name, fromRef ? { fromRef, fromDetached } : undefined)
      // Rafraîchit le cache repo (head/isDetached/isDirty) + les vues dépendantes.
      try {
        const fresh = await apiOpenRepo(activeRepo)
        setRepoCache(activeRepo, fresh)
      } catch {
        /* ignore */
      }
      queryClient.invalidateQueries({ queryKey: ['branches', activeRepo] })
      queryClient.invalidateQueries({ queryKey: ['git-log', activeRepo] })
      queryClient.invalidateQueries({ queryKey: ['git-status', activeRepo] })
      setActiveWorkspacePath(null)
      setOpen(false)
      setQuery('')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative flex min-w-0 items-center gap-0.5">
      {activeWorkspacePath && (
        <button
          type="button"
          onClick={() => setActiveWorkspacePath(null)}
          aria-label={t('toolbar.exitWorkspace')}
          title={t('toolbar.exitWorkspace')}
          data-testid="workspace-exit-button"
          className="flex h-5 w-5 shrink-0 items-center justify-center self-end rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex min-w-0 flex-col justify-center">
        <span className="select-none px-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
          {activeWorkspacePath ? t('toolbar.workspaceLabel') : t('toolbar.branchLabel')}
        </span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={currentLabel}
              className="flex h-5 min-w-0 max-w-[200px] items-center gap-1 rounded px-1 text-sm font-bold transition-colors hover:bg-accent"
            >
              <span
                data-testid="branch-context-label"
                className="min-w-0 flex-1 truncate text-left"
              >
                {currentLabel}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('branch.checkout')}
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-1">
              {showCurrentRow && (
                <div
                  data-testid="branch-context-current"
                  className="flex w-full items-center gap-2 rounded bg-accent/60 px-2 py-1.5 text-left"
                >
                  {activeWorkspacePath ? (
                    <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                    {currentLabel}
                  </span>
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                </div>
              )}
              {entries.length === 0 && !showCurrentRow ? (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  {t('branch.title')}
                </div>
              ) : (
                entries.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    data-testid={
                      entry.kind === 'workspace'
                        ? `workspace-option-${entry.path}`
                        : `branch-option-${entry.label}`
                    }
                    onClick={() =>
                      entry.kind === 'workspace'
                        ? handleOpenWorkspace(entry.path)
                        : handleCheckout(entry.name)
                    }
                    disabled={busy !== null}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    {entry.kind === 'workspace' ? (
                      <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {entry.label}
                    </span>
                    {busy === entry.label && <Spinner className="h-3 w-3 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {error &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-lg">
            {error}
          </div>,
          document.body
        )}
    </div>
  )
}
