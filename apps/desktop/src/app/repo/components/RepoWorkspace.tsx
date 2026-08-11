import { useState } from 'react'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useRepoViewStore } from '../../../stores/repoView.store'
import { useCommitSearchStore } from '../../../stores/commitSearch.store'
import { useSoloModeStore } from '../../../stores/soloMode.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { FilesPage, FileTreeSidebar } from '../../../features/files'
import { BoardPage, BoardSidebar } from '../../../features/board'
import {
  GitGraph,
  RepositorySidebar,
  RenameBranchDialog,
  DeleteRemoteBranchDialog,
  CompareBranchesDialog,
  SetUpstreamDialog,
  TagDialogsManager,
  useSidebarBranchMenu,
  useSidebarTagMenu,
} from '../../../features/graph'
import { BlameHistoryPanel } from '../../../components/diff-viewer/BlameHistoryPanel'
import { TimelineBar } from '../../../components/timeline/TimelineBar'
import { BisectSetupBanner } from '../../../components/bisect/BisectSetupBanner'

interface RepoWorkspaceProps {
  /** The path actually being viewed — the repo tab's own path, or a linked worktree's. */
  repoPath: string
  /** The repo tab's own path, whose cached remotes label the sidebar. */
  activeRepo: string
}

/**
 * The body of a repo tab: the left panel, the central area, the timeline rail and the dialogs the
 * branch/tag menus open. Which view all three are showing is chosen in the toolbar above
 * (`RepoViewSwitcher`).
 *
 * **Both the panel and the central area are scoped to the active view** (`repoView.store`), and they
 * change together: the graph gets the branch sidebar beside it, the files view gets its own working
 * tree, the board gets the repo's boards. A repo tab has one panel slot and the active view fills it
 * — rather than every view sharing the graph's branch list and adding a panel of its own on the
 * other side, which is how the files view ended up with its tree on the right.
 *
 * The one exception is blame/history, which is not a view's panel but a *file's*: it is opened from
 * the diff viewer, and the diff viewer is reachable from the graph and from the files view alike, so
 * it takes the slot on both. On the graph `RepositorySidebar` swaps itself out for it; on the files
 * view the branch below does the same explicitly.
 *
 * Kept out of `RepoView`, which owns only the toolbar and the repo-wide banners, so everything
 * repo-scoped — including a rename or tag dialog — mounts and unmounts as one unit.
 */
export function RepoWorkspace({ repoPath, activeRepo }: RepoWorkspaceProps) {
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const repoCache = useRepoDataStore((s) => s.repoCache)
  const searchQuery = useCommitSearchStore((s) => s.query)
  // Solo mode: when active, the graph is isolated to the soloed branches (see soloMode.store.ts).
  const soloActive = useSoloModeStore((s) => s.active)
  const soloed = useSoloModeStore((s) => s.soloed)

  const view = useRepoViewStore((s) => s.view)
  // One flag for the panel slot, whichever view is filling it — see `repoView.store`.
  const isPanelOpen = useRepoViewStore((s) => s.isPanelOpen)

  const github = useSettingsStore((s) => s.settings.github)
  const activeAccount = github?.accounts?.find((a) => a.id === github.activeAccountId) || null

  const { openBranchMenu, renameTarget, setRenameTarget, setUpstreamTarget, setSetUpstreamTarget } =
    useSidebarBranchMenu(repoPath)
  const { openTagMenu } = useSidebarTagMenu(repoPath)
  // The ref-scoped dialogs are mounted *here*, and only here, for the reason the comparison dialog
  // below already gives: this component stays mounted whichever view is active, so a dialog opened
  // from a tag badge does not vanish the moment the user switches. Both the graph's menus and the
  // sidebar's write the same shared state (`repoUI.store`).
  const pendingTagAction = useRepoUIStore((s) => s.pendingTagDialog)
  const setPendingTagAction = useRepoUIStore((s) => s.setPendingTagDialog)
  const pendingDeleteRemoteBranch = useRepoUIStore((s) => s.pendingRemoteBranchDelete)
  const setPendingDeleteRemoteBranch = useRepoUIStore((s) => s.setPendingRemoteBranchDelete)
  // The two refs the branch comparison dialog is showing (set by the graph's and the sidebar's
  // branch menus alike), or null when it is closed.
  const compareRefsTarget = useRepoUIStore((s) => s.compareRefsTarget)
  const setCompareRefsTarget = useRepoUIStore((s) => s.setCompareRefsTarget)
  // Whether a file's blame or history has taken the panel slot — see the doc comment above.
  const activeLeftPanel = useRepoUIStore((s) => s.activeLeftPanel)
  const activeDiffFile = useRepoUIStore((s) => s.activeDiffFile)
  const setActiveLeftPanel = useRepoUIStore((s) => s.setActiveLeftPanel)
  const isFilePanelActive = activeLeftPanel === 'blame' || activeLeftPanel === 'history'

  return (
    <>
      {/* ── Main layout: the view's panel | the view ────────────── */}
      <div data-testid="repo-workspace" className="relative flex flex-1 overflow-hidden">
        {/* Not gated on `isPanelOpen` like the other two: this panel answers the flag itself, by
            reducing to its column of section icons rather than leaving the slot empty. */}
        {view === 'graph' && (
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
            githubAccountId={activeAccount?.id ?? undefined}
            onContextMenu={openBranchMenu}
            onRemoteBranchContextMenu={openBranchMenu}
            onTagContextMenu={openTagMenu}
          />
        )}

        {isPanelOpen &&
          view === 'files' &&
          (isFilePanelActive ? (
            <div
              data-testid="files-blame-history-panel"
              className="flex h-full w-[350px] shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar"
            >
              <BlameHistoryPanel
                file={activeDiffFile}
                repoPath={repoPath}
                onClose={() => setActiveLeftPanel('sidebar')}
              />
            </div>
          ) : (
            <FileTreeSidebar />
          ))}

        {isPanelOpen && view === 'board' && <BoardSidebar repoPath={repoPath} />}

        {/* Central area — the view itself */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {view === 'board' ? (
            <BoardPage repoPath={repoPath} />
          ) : view === 'files' ? (
            <FilesPage />
          ) : (
            <GitGraph
              repoPath={repoPath}
              branch={selectedBranch ?? undefined}
              soloBranches={soloActive ? Array.from(soloed) : undefined}
              searchQuery={searchQuery}
            />
          )}
        </div>

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
          stay open (and openable) while another view has the graph unmounted. */}
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
