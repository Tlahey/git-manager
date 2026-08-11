import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, GitBranch, Layers, Search, X } from 'lucide-react'
import { Spinner, Popover, PopoverTrigger, PopoverContent, Input } from '@git-manager/ui'
import { TruncatedLabel } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import type { GitWorktree } from '@git-manager/git-types'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useBranches } from '../../hooks/useBranches'
import { useSwitchBranch } from '../../hooks/useSwitchBranch'
import { apiListWorktrees } from '../../api/worktree.api'

type ContextEntry =
  | { kind: 'workspace'; key: string; label: string; path: string }
  | { kind: 'branch'; key: string; label: string; name: string }

/** Selector merging the current branch/workspace context with both switch targets: pick a local
 * branch (checked out on the base project — see `useSwitchBranch`) or a linked worktree
 * ("workspace" — a view switch onto that worktree's own data, no tab change, no checkout — see
 * repoUI.store.ts's `activeWorkspacePath`). The list is ordered current → workspaces → branches,
 * each icon-tagged.
 *
 * The two kinds are mutually exclusive by construction: a branch held by a linked worktree is shown
 * as that worktree and nothing else, so the branch rows are exactly those the base project may
 * check out. That split is what the whole list is for — it is the difference between a gesture that
 * moves HEAD and one that only changes what is on screen. */
export function BranchContext() {
  const { t } = useTranslation('git')
  const { activeRepo, activeWorkspacePath } = useRepoUIStore()
  const setActiveWorkspacePath = useRepoUIStore((s) => s.setActiveWorkspacePath)
  const repoCache = useRepoDataStore((s) => s.repoCache)
  const { switchBranch } = useSwitchBranch()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

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

  // A detached HEAD is checked *first*, not as a fallback: no branch is HEAD in that state, so a
  // `headBranch` still coming out of the branch list can only be data from before the detach, and
  // preferring it made the toolbar name a branch the repository had already left.
  const branchLabel = repo?.isDetached
    ? repo.head.slice(0, 10)
    : (headBranch?.shortName ?? repo?.head ?? '—')
  const currentLabel = activeWorkspacePath ? (activeWorkspace?.branch ?? '—') : branchLabel

  const q = query.trim().toLowerCase()
  const matchesQuery = (label: string) => !q || label.toLowerCase().includes(q)

  // Neither the base project (`isMain`) nor whatever is already on screen is a place to switch
  // *to*: `activeWorkspacePath` is the workspace being viewed, and `activeRepo` covers the case
  // the tab itself is a linked worktree — offering that one listed the branch you are standing on
  // as somewhere else to go, and hid it from the branch list on the way.
  const workspaceEntries = worktrees.filter(
    (wt) =>
      !wt.isMain &&
      wt.branch !== '(detached HEAD)' &&
      wt.path !== activeWorkspacePath &&
      wt.path !== activeRepo &&
      matchesQuery(wt.branch)
  )
  // A branch already checked out in one of the listed worktrees is shown as its worktree only.
  const workspaceBranchNames = new Set(workspaceEntries.map((wt) => wt.branch))
  const entries: ContextEntry[] = [
    ...workspaceEntries.map((wt): ContextEntry => ({
      kind: 'workspace',
      key: wt.path,
      label: wt.branch,
      path: wt.path,
    })),
    ...locals
      .filter(
        (b) =>
          (activeWorkspacePath ? true : !b.isHead) &&
          matchesQuery(b.shortName) &&
          !workspaceBranchNames.has(b.shortName)
      )
      .map((b): ContextEntry => ({
        kind: 'branch',
        key: b.name,
        label: b.shortName,
        name: b.shortName,
      })),
  ]
  const showCurrentRow = matchesQuery(currentLabel)

  function handleOpenWorkspace(path: string) {
    setActiveWorkspacePath(path)
    setOpen(false)
    setQuery('')
  }

  /** The picker's only job here is the busy spinner and closing itself — where the switch lands,
   * and the view following it there, belong to `useSwitchBranch`. */
  async function handleCheckout(name: string) {
    if (!activeRepo || busy) return
    setBusy(name)
    try {
      if (await switchBranch(name)) {
        setOpen(false)
        setQuery('')
      }
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
          className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center self-end rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex min-w-0 flex-col justify-center">
        <span className="px-1 text-[9px] font-medium tracking-wider text-muted-foreground/60 uppercase select-none">
          {activeWorkspacePath ? t('toolbar.workspaceLabel') : t('toolbar.branchLabel')}
        </span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid="branch-context-trigger"
              className="flex h-5 max-w-[200px] min-w-0 cursor-pointer items-center gap-1 rounded px-1 text-sm font-bold transition-colors hover:bg-accent"
            >
              <span data-testid="branch-context-label" className="min-w-0 flex-1 text-left">
                <TruncatedLabel label={currentLabel} placement="bottom" />
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 overflow-hidden p-0">
            <div className="border-b border-border p-1.5">
              <Input
                variant="ghost"
                inputSize="sm"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('branch.checkout')}
                startIcon={<Search className="h-3.5 w-3.5 text-muted-foreground" />}
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
                  <TruncatedLabel
                    label={currentLabel}
                    className="min-w-0 flex-1 text-xs font-medium text-foreground"
                  />
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
                    className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left transition-colors enabled:hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {entry.kind === 'workspace' ? (
                      <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <TruncatedLabel
                      label={entry.label}
                      className="min-w-0 flex-1 text-xs font-medium text-foreground"
                    />
                    {busy === entry.label && <Spinner className="h-3 w-3 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
