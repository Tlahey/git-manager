import { useEffect, useState } from 'react'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'
import { useCommitSearchStore } from '../../stores/commitSearch.store'
import { useSoloModeStore } from '../../stores/soloMode.store'
import { GitGraph } from '../../components/git-graph/GitGraph'
import { RepositorySidebar } from '../../components/repository-sidebar'
import { RenameBranchDialog } from '../../components/git-graph/RenameBranchDialog'
import { CompareBranchesDialog } from '../../components/git-graph/CompareBranchesDialog'
import { ActionToolbar } from '../../components/action-toolbar'
import type { Section, Scope } from '../settings/SettingsPage'
import { useSettingsStore } from '../../stores/settings.store'
import { useSidebarBranchMenu } from '../../hooks/useSidebarBranchMenu'
import { useSidebarTagMenu } from '../../hooks/useSidebarTagMenu'
import { TagDialogsManager } from '../../components/git-graph/components/TagDialogsManager'
import { useFileExplorerStore } from '../../stores/fileExplorer.store'
import { apiOpenRepo } from '../../api/repo.api'
import { ProjectFilesView } from '../../components/file-explorer/ProjectFilesView'
import { FileTreeSidebar } from '../../components/file-explorer/FileTreeSidebar'
import { PendingFixupsBanner } from '../../components/fixup/PendingFixupsBanner'
import { TimelineBar } from '../../components/timeline/TimelineBar'
import { BisectBanner } from '../../components/bisect/BisectBanner'
import { BisectResultBanner } from '../../components/bisect/BisectResultBanner'
import { BisectSetupBanner } from '../../components/bisect/BisectSetupBanner'
import { BisectStashDialog } from '../../components/bisect/BisectStashDialog'
import { CheckoutStashConfirm } from '../../components/checkout/CheckoutStashConfirm'
import { setTerminalTheme } from '../../lib/terminalRegistry'
import { useEffectiveRepoSettings } from '../../hooks/useEffectiveRepoSettings'

interface RepoViewProps {
  /** Opens Settings on a given page/scope — forwarded to the toolbar, whose merge-target popover
   * links to this repo's GitFlow settings. */
  onOpenSettings?: (section?: Section, scope?: Scope) => void
}

export function RepoView({ onOpenSettings }: RepoViewProps = {}) {
  const { activeRepo, activeWorkspacePath } = useRepoUIStore()
  const { repoCache, setRepoCache } = useRepoDataStore()
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const searchQuery = useCommitSearchStore((s) => s.query)
  // Solo mode: when active, the graph is isolated to the soloed branches (see soloMode.store.ts).
  const soloActive = useSoloModeStore((s) => s.active)
  const soloed = useSoloModeStore((s) => s.soloed)

  // The two refs the branch comparison dialog is showing (set by the graph's and the sidebar's
  // branch menus alike), or null when it is closed.
  const compareRefsTarget = useRepoUIStore((s) => s.compareRefsTarget)
  const setCompareRefsTarget = useRepoUIStore((s) => s.setCompareRefsTarget)

  const isFileExplorerOpen = useFileExplorerStore((s) => s.isOpen)
  const isSidebarOpen = useFileExplorerStore((s) => s.isSidebarOpen)
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

  const github = useSettingsStore((s) => s.settings.github)
  const activeAccount = github?.accounts?.find((a) => a.id === github.activeAccountId) || null

  const branchMenuPath = effectiveRepoPath ?? activeRepo ?? ''
  const { openBranchMenu, renameTarget, setRenameTarget } = useSidebarBranchMenu(branchMenuPath)
  // The sidebar's tag rows open the tag menu, mounted here rather than in the graph: the graph is
  // unmounted while the file explorer is open, and a tag row has to stay actionable there.
  const { openTagMenu, pendingTagAction, setPendingTagAction } = useSidebarTagMenu(branchMenuPath)

  if (!activeRepo) return null

  const repoPath = effectiveRepoPath ?? activeRepo

  return (
    <div data-testid="repo-view" className="flex h-full flex-col">
      <ActionToolbar onOpenSettings={onOpenSettings} />

      <PendingFixupsBanner repoPath={activeRepo} />
      <BisectBanner repoPath={repoPath} />

      {/* ── Main layout: sidebar | central area ─────────────────── */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Branch sidebar — resizable */}
        <RepositorySidebar
          repoPath={repoPath}
          remoteUrls={repoCache[activeRepo]?.remotes ?? []}
          selectedBranch={selectedBranch}
          onSelectBranch={(name) => setSelectedBranch(name)}
          // A tag isn't a filterable ref: instead of reloading the whole log, scroll to and select
          // its commit in the current graph via the graph-selection bridge.
          onSelectTag={(commitOid) =>
            useRepoUIStore.getState().setPendingGraphSelection(commitOid)
          }
          onOpenPr={(pr) => {
            setSelectedBranch(pr.headRef)
            useRepoUIStore.getState().setActivePrNumber(pr.number)
          }}
          currentUser={activeAccount?.user?.login}
          githubToken={activeAccount?.token ?? undefined}
          onContextMenu={openBranchMenu}
          onRemoteBranchContextMenu={openBranchMenu}
          onTagContextMenu={openTagMenu}
        />

        {/* Central area — full-width history, or the file explorer */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {isFileExplorerOpen ? (
            <ProjectFilesView />
          ) : (
            <GitGraph
              repoPath={repoPath}
              branch={selectedBranch ?? undefined}
              soloBranches={soloActive ? Array.from(soloed) : undefined}
              searchQuery={searchQuery}
            />
          )}
        </div>

        {isFileExplorerOpen && isSidebarOpen && <FileTreeSidebar />}

        <TimelineBar repoPath={repoPath} />

        <BisectSetupBanner repoPath={repoPath} />
      </div>

      <BisectResultBanner repoPath={repoPath} />
      <BisectStashDialog repoPath={repoPath} />
      <CheckoutStashConfirm />

      <TagDialogsManager
        repoPath={branchMenuPath}
        pendingTagAction={pendingTagAction}
        onClearPendingTagAction={() => setPendingTagAction(null)}
      />

      {renameTarget && (
        <RenameBranchDialog
          key={renameTarget}
          repoPath={branchMenuPath}
          branch={renameTarget}
          open
          onClose={() => setRenameTarget(null)}
        />
      )}

      {/* Branch comparison — mounted here rather than in the graph's overlay manager for the same
          reason as the tag dialogs: it is about two refs, not about a selected commit, so it must
          stay open (and openable) while the file explorer has the graph unmounted. */}
      {compareRefsTarget && (
        <CompareBranchesDialog
          repoPath={branchMenuPath}
          baseRef={compareRefsTarget.baseRef}
          headRef={compareRefsTarget.headRef}
          open
          onChangeRefs={(baseRef, headRef) => setCompareRefsTarget({ baseRef, headRef })}
          onClose={() => setCompareRefsTarget(null)}
        />
      )}
    </div>
  )
}
