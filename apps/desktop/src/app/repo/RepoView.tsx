import { useEffect, useState } from 'react'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'
import { useCommitSearchStore } from '../../stores/commitSearch.store'
import { GitGraph } from '../../components/git-graph/GitGraph'
import { RepositorySidebar } from '../../components/repository-sidebar'
import { RenameBranchDialog } from '../../components/git-graph/RenameBranchDialog'
import { ActionToolbar } from '../../components/action-toolbar'
import { useSettingsStore } from '../../stores/settings.store'
import { useSidebarBranchMenu } from '../../hooks/useSidebarBranchMenu'
import { apiOpenRepo } from '../../api/repo.api'
import { PendingFixupsBanner } from '../../components/fixup/PendingFixupsBanner'
import { TimelineBar } from '../../components/timeline/TimelineBar'

export function RepoView() {
  const { activeRepo, activeWorkspacePath } = useRepoUIStore()
  const { repoCache, setRepoCache } = useRepoDataStore()
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const searchQuery = useCommitSearchStore((s) => s.query)

  // Viewing a workspace (linked worktree) swaps every data-driven view (sidebar, graph) onto its
  // path instead of the repo tab's own — the tab/`activeRepo` itself never changes, only what's
  // displayed. See repoUI.store.ts's `activeWorkspacePath` doc comment for why.
  const effectiveRepoPath = activeWorkspacePath ?? activeRepo

  // Le cache repo n'est pas persisté : on (ré)ouvre le dépôt/workspace actif au besoin
  // pour alimenter head/isDetached/isDirty/remotes (toolbar, badges d'état…).
  useEffect(() => {
    if (effectiveRepoPath && !repoCache[effectiveRepoPath]) {
      apiOpenRepo(effectiveRepoPath)
        .then((r) => {
          setRepoCache(effectiveRepoPath, r)
          // Purge les entrées undo/redo persistées dont l'objet Git référencé a disparu
          // depuis la dernière session (ex. git gc manuel en dehors de l'app).
          useUndoHistoryStore.getState().validateAndPrune(effectiveRepoPath)
        })
        .catch(() => {
          /* dépôt introuvable / non-git : ignoré */
        })
    }
  }, [effectiveRepoPath, repoCache, setRepoCache])

  const github = useSettingsStore((s) => s.settings.github)
  const activeAccount = github?.accounts?.find((a) => a.id === github.activeAccountId) || null

  const branchMenuPath = effectiveRepoPath ?? activeRepo ?? ''
  const { openBranchMenu, renameTarget, setRenameTarget } = useSidebarBranchMenu(branchMenuPath)

  if (!activeRepo) return null

  const repoPath = effectiveRepoPath ?? activeRepo

  return (
    <div data-testid="repo-view" className="flex h-full flex-col">
      <ActionToolbar />

      <PendingFixupsBanner repoPath={activeRepo} />

      {/* ── Layout principal : sidebar | zone centrale ──────────── */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Sidebar branches — redimensionnable */}
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
        />

        {/* Zone centrale — historique plein largeur */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <GitGraph
            repoPath={repoPath}
            branch={selectedBranch ?? undefined}
            searchQuery={searchQuery}
          />
        </div>

        <TimelineBar repoPath={repoPath} />
      </div>

      {renameTarget && (
        <RenameBranchDialog
          key={renameTarget}
          repoPath={branchMenuPath}
          branch={renameTarget}
          open
          onClose={() => setRenameTarget(null)}
        />
      )}
    </div>
  )
}
