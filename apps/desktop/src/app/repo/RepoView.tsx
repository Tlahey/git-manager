import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { GitBranch } from '@git-manager/git-types'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'
import { GitGraph } from '../../components/git-graph/GitGraph'
import { RepositorySidebar } from '../../components/repository-sidebar'
import { ActionToolbar } from '../../components/action-toolbar'
import { useSettingsStore } from '../../stores/settings.store'
import { showBranchNativeContextMenu } from '../../api/nativeMenu.api'
import { apiDeleteBranch } from '../../api/git.api'
import { apiOpenRepo } from '../../api/repo.api'
import { PendingFixupsBanner } from '../../components/fixup/PendingFixupsBanner'

export function RepoView() {
  const { activeRepo } = useRepoUIStore()
  const { repoCache, setRepoCache } = useRepoDataStore()
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const queryClient = useQueryClient()

  // Le cache repo n'est pas persisté : on (ré)ouvre le dépôt actif au besoin
  // pour alimenter head/isDetached/isDirty/remotes (toolbar, badges d'état…).
  useEffect(() => {
    if (activeRepo && !repoCache[activeRepo]) {
      apiOpenRepo(activeRepo)
        .then((r) => {
          setRepoCache(activeRepo, r)
          // Purge les entrées undo/redo persistées dont l'objet Git référencé a disparu
          // depuis la dernière session (ex. git gc manuel en dehors de l'app).
          useUndoHistoryStore.getState().validateAndPrune(activeRepo)
        })
        .catch(() => {
          /* dépôt introuvable / non-git : ignoré */
        })
    }
  }, [activeRepo, repoCache, setRepoCache])

  const github = useSettingsStore((s) => s.settings.github)
  const activeAccount = github?.accounts?.find((a) => a.id === github.activeAccountId) || null

  async function handleBranchContextMenu(e: React.MouseEvent, branch: GitBranch) {
    e.preventDefault()
    if (branch.isRemote || !activeRepo) return
    await showBranchNativeContextMenu({
      isHead: branch.isHead,
      onDelete: async () => {
        if (!window.confirm(`Delete branch "${branch.shortName}"?`)) return
        try {
          await apiDeleteBranch(activeRepo, branch.shortName, {
            targetOid: branch.commitOid,
            upstream: branch.upstream ?? undefined,
          })
          queryClient.invalidateQueries({ queryKey: ['branches', activeRepo] })
        } catch (err) {
          alert(String(err))
        }
      },
    })
  }

  if (!activeRepo) return null

  return (
    <div data-testid="repo-view" className="flex h-full flex-col">
      <ActionToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <PendingFixupsBanner repoPath={activeRepo} />

      {/* ── Layout principal : sidebar | zone centrale ──────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar branches — redimensionnable */}
        <RepositorySidebar
          repoPath={activeRepo}
          remoteUrls={repoCache[activeRepo]?.remotes ?? []}
          selectedBranch={selectedBranch}
          onSelectBranch={(name) => setSelectedBranch(name)}
          onOpenPr={(pr) => setSelectedBranch(pr.headRef)}
          currentUser={activeAccount?.user?.login}
          githubToken={activeAccount?.token ?? undefined}
          onContextMenu={handleBranchContextMenu}
        />

        {/* Zone centrale — historique plein largeur */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <GitGraph
            repoPath={activeRepo}
            branch={selectedBranch ?? undefined}
            searchQuery={searchQuery}
          />
        </div>
      </div>
    </div>
  )
}


