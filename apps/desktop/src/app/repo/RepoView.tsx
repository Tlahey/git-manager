import { useEffect } from 'react'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'
import { ActionToolbar } from '../../components/action-toolbar'
import type { Section, Scope } from '../settings/SettingsPage'
import { useFileExplorerStore } from '../../stores/fileExplorer.store'
import { apiOpenRepo } from '../../api/repo.api'
import { PendingFixupsBanner } from '../../components/fixup/PendingFixupsBanner'
import { BisectBanner } from '../../components/bisect/BisectBanner'
import { BisectResultBanner } from '../../components/bisect/BisectResultBanner'
import { BisectStashDialog } from '../../components/bisect/BisectStashDialog'
import { CheckoutStashConfirm } from '../../components/checkout/CheckoutStashConfirm'
import { setTerminalTheme } from '../../lib/terminalRegistry'
import { useEffectiveRepoSettings } from '../../hooks/useEffectiveRepoSettings'
import { useBranches } from '../../hooks/useBranches'
import { RepoGraphWorkspace } from './components/RepoGraphWorkspace'

interface RepoViewProps {
  /** Opens Settings on a given page/scope — forwarded to the toolbar, whose merge-target popover
   * links to this repo's GitFlow settings. */
  onOpenSettings?: (section?: Section, scope?: Scope) => void
}

/**
 * One repo tab's content: the repo-wide toolbar, the repo-wide notices, and the graph workspace.
 */
export function RepoView({ onOpenSettings }: RepoViewProps = {}) {
  const { activeRepo, activeWorkspacePath } = useRepoUIStore()
  const { repoCache, setRepoCache } = useRepoDataStore()

  const syncFileExplorerRepo = useFileExplorerStore((s) => s.actions.syncRepo)

  // Viewing a workspace (linked worktree) swaps every data-driven view (sidebar, graph) onto its
  // path instead of the repo tab's own — the tab/`activeRepo` itself never changes, only what's
  // displayed. See repoUI.store.ts's `activeWorkspacePath` doc comment for why.
  const effectiveRepoPath = activeWorkspacePath ?? activeRepo

  // The repo cache isn't persisted: (re)open the active repo/worktree when needed to feed
  // head/isDetached/isDirty/remotes (toolbar, status badges…).
  useEffect(() => {
    if (effectiveRepoPath && !repoCache[effectiveRepoPath]) {
      apiOpenRepo(effectiveRepoPath)
        .then((r) => {
          setRepoCache(effectiveRepoPath, r)
          // Drop persisted undo/redo entries whose Git object has disappeared since the last
          // session (e.g. a manual `git gc` outside the app).
          useUndoHistoryStore.getState().validateAndPrune(effectiveRepoPath)
        })
        .catch(() => {
          /* repository not found / not a git repo: ignored */
        })
    }
  }, [effectiveRepoPath, repoCache, setRepoCache])

  // …and re-read it whenever the branch list does, since that is exactly when HEAD may have moved.
  // The effect above only fills the cache when it is *missing*, so `head`/`isDetached` otherwise
  // kept saying whatever was true when the tab was opened. Nothing noticed while HEAD stayed on a
  // branch — the toolbar reads the branch list first and only falls back to this — but a checkout
  // *into* a detached HEAD has no branch to report, so the fallback is the only answer, and it was
  // stale: undoing a checkout made from a detached HEAD left the toolbar naming the branch the
  // user had just left.
  const { data: branchList } = useBranches(effectiveRepoPath ?? '')
  useEffect(() => {
    if (!effectiveRepoPath || !branchList) return
    apiOpenRepo(effectiveRepoPath)
      .then((r) => setRepoCache(effectiveRepoPath, r))
      .catch(() => {
        /* repository not found / not a git repo: ignored */
      })
  }, [effectiveRepoPath, branchList, setRepoCache])

  // The file explorer browses one repository at a time; a tab (or worktree) switch has to drop the
  // previous one's selected file and directory rather than carry them into a tree they don't exist
  // in. Kept here, outside the explorer's own components, so it happens even while it's closed.
  useEffect(() => {
    syncFileExplorerRepo(effectiveRepoPath)
  }, [effectiveRepoPath, syncFileExplorerRepo])

  // Terminal colours resolve per-repo (repo override → global appearance value), so the active
  // repo/worktree's configuration themes its shells.
  const { terminalBackground, terminalForeground } = useEffectiveRepoSettings(effectiveRepoPath)

  // Keep every open terminal (and any spawned later) themed with the user's chosen colours.
  useEffect(() => {
    setTerminalTheme({ background: terminalBackground, foreground: terminalForeground })
  }, [terminalBackground, terminalForeground])

  if (!activeRepo) return null

  const repoPath = effectiveRepoPath ?? activeRepo

  return (
    <div data-testid="repo-view" className="flex h-full flex-col">
      <ActionToolbar onOpenSettings={onOpenSettings} />

      <PendingFixupsBanner repoPath={activeRepo} />
      <BisectBanner repoPath={repoPath} />

      <RepoGraphWorkspace repoPath={repoPath} activeRepo={activeRepo} />

      <BisectResultBanner repoPath={repoPath} />
      <BisectStashDialog repoPath={repoPath} />
      <CheckoutStashConfirm />
    </div>
  )
}
