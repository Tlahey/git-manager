import { useState } from 'react'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useCommitSearchStore } from '../../../stores/commitSearch.store'
import { useSoloModeStore } from '../../../stores/soloMode.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { useFileExplorerStore } from '../../../stores/fileExplorer.store'
import { GitGraph } from '../../../components/git-graph/GitGraph'
import { RepositorySidebar } from '../../../components/repository-sidebar'
import { RenameBranchDialog } from '../../../components/git-graph/RenameBranchDialog'
import { DeleteRemoteBranchDialog } from '../../../components/git-graph/DeleteRemoteBranchDialog'
import { CompareBranchesDialog } from '../../../components/git-graph/CompareBranchesDialog'
import { SetUpstreamDialog } from '../../../components/git-graph/SetUpstreamDialog'
import { TagDialogsManager } from '../../../components/git-graph/components/TagDialogsManager'
import { ProjectFilesView } from '../../../components/file-explorer/ProjectFilesView'
import { FileTreeSidebar } from '../../../components/file-explorer/FileTreeSidebar'
import { TimelineBar } from '../../../components/timeline/TimelineBar'
import { BisectSetupBanner } from '../../../components/bisect/BisectSetupBanner'
import { useSidebarBranchMenu } from '../../../hooks/useSidebarBranchMenu'
import { useSidebarTagMenu } from '../../../hooks/useSidebarTagMenu'

interface RepoGraphWorkspaceProps {
  /** The path actually being viewed — the repo tab's own path, or a linked worktree's. */
  repoPath: string
  /** The repo tab's own path, whose cached remotes label the sidebar. */
  activeRepo: string
}

/**
 * The body of a repo tab: branch sidebar, the commit graph (or the file explorer that takes its
 * place), the timeline rail, and the dialogs the sidebar's own menus open. Kept out of `RepoView`,
 * which owns only the toolbar and the repo-wide banners, so everything graph-scoped — including a
 * rename/tag dialog — mounts and unmounts as one unit.
 */
export function RepoGraphWorkspace({ repoPath, activeRepo }: RepoGraphWorkspaceProps) {
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const repoCache = useRepoDataStore((s) => s.repoCache)
  const searchQuery = useCommitSearchStore((s) => s.query)
  // Solo mode: when active, the graph is isolated to the soloed branches (see soloMode.store.ts).
  const soloActive = useSoloModeStore((s) => s.active)
  const soloed = useSoloModeStore((s) => s.soloed)

  const isFileExplorerOpen = useFileExplorerStore((s) => s.isOpen)
  const isSidebarOpen = useFileExplorerStore((s) => s.isSidebarOpen)

  const github = useSettingsStore((s) => s.settings.github)
  const activeAccount = github?.accounts?.find((a) => a.id === github.activeAccountId) || null

  const { openBranchMenu, renameTarget, setRenameTarget, setUpstreamTarget, setSetUpstreamTarget } =
    useSidebarBranchMenu(repoPath)
  const { openTagMenu } = useSidebarTagMenu(repoPath)
  // The ref-scoped dialogs are mounted *here*, and only here, for the reason the comparison dialog
  // below already gives: this component stays mounted while the file explorer replaces the graph,
  // so a dialog opened from a tag badge does not vanish the moment the user opens it. Both the
  // graph's menus and the sidebar's write the same shared state (`repoUI.store`).
  const pendingTagAction = useRepoUIStore((s) => s.pendingTagDialog)
  const setPendingTagAction = useRepoUIStore((s) => s.setPendingTagDialog)
  const pendingDeleteRemoteBranch = useRepoUIStore((s) => s.pendingRemoteBranchDelete)
  const setPendingDeleteRemoteBranch = useRepoUIStore((s) => s.setPendingRemoteBranchDelete)
  // The two refs the branch comparison dialog is showing (set by the graph's and the sidebar's
  // branch menus alike), or null when it is closed.
  const compareRefsTarget = useRepoUIStore((s) => s.compareRefsTarget)
  const setCompareRefsTarget = useRepoUIStore((s) => s.setCompareRefsTarget)

  return (
    <>
      {/* ── Main layout: sidebar | central area ─────────────────── */}
      <div data-testid="repo-graph-view" className="relative flex flex-1 overflow-hidden">
        {/* Branch sidebar — resizable */}
        <RepositorySidebar
          repoPath={repoPath}
          remoteUrls={repoCache[activeRepo]?.remotes ?? []}
          selectedBranch={selectedBranch}
          onSelectBranch={(name) => setSelectedBranch(name)}
          // A tag isn't a filterable ref: instead of reloading the whole log, scroll to and select
          // its commit in the current graph via the graph-selection bridge.
          onSelectTag={(commitOid) => useRepoUIStore.getState().setPendingGraphSelection(commitOid)}
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

      <TagDialogsManager
        repoPath={repoPath}
        pendingTagAction={pendingTagAction}
        onClearPendingTagAction={() => setPendingTagAction(null)}
      />

      {renameTarget && (
        <RenameBranchDialog
          key={renameTarget}
          repoPath={repoPath}
          branch={renameTarget}
          open
          onClose={() => setRenameTarget(null)}
        />
      )}

      {pendingDeleteRemoteBranch && (
        <DeleteRemoteBranchDialog
          key={`${pendingDeleteRemoteBranch.remote}/${pendingDeleteRemoteBranch.branchName}`}
          repoPath={repoPath}
          branchName={pendingDeleteRemoteBranch.branchName}
          remote={pendingDeleteRemoteBranch.remote}
          open
          onClose={() => setPendingDeleteRemoteBranch(null)}
        />
      )}

      {/* Branch comparison — mounted here rather than in the graph's overlay manager for the same
          reason as the tag dialogs: it is about two refs, not about a selected commit, so it must
          stay open (and openable) while the file explorer has the graph unmounted. */}
      {compareRefsTarget && (
        <CompareBranchesDialog
          repoPath={repoPath}
          baseRef={compareRefsTarget.baseRef}
          headRef={compareRefsTarget.headRef}
          open
          onChangeRefs={(baseRef, headRef) => setCompareRefsTarget({ baseRef, headRef })}
          onClose={() => setCompareRefsTarget(null)}
        />
      )}

      {setUpstreamTarget && (
        <SetUpstreamDialog
          key={setUpstreamTarget}
          repoPath={repoPath}
          branch={setUpstreamTarget}
          open
          onClose={() => setSetUpstreamTarget(null)}
        />
      )}
    </>
  )
}
