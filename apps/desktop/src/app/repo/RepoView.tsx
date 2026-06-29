import { useEffect, useState } from 'react'
import { useReposStore } from '../../stores/repos.store'
import { openRepo } from '../../lib/tauri'
import { GitGraph } from '../../components/git-graph/GitGraph'
import { RepositorySidebar } from '../../components/repository-sidebar'
import { ActionToolbar } from '../../components/action-toolbar'
import { useSettingsStore } from '../../stores/settings.store'

export function RepoView() {
  const { activeRepo, repoCache, setRepoCache } = useReposStore()
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Le cache repo n'est pas persisté : on (ré)ouvre le dépôt actif au besoin
  // pour alimenter head/isDetached/isDirty/remotes (toolbar, badges d'état…).
  useEffect(() => {
    if (activeRepo && !repoCache[activeRepo]) {
      openRepo(activeRepo)
        .then((r) => setRepoCache(activeRepo, r))
        .catch(() => {
          /* dépôt introuvable / non-git : ignoré */
        })
    }
  }, [activeRepo, repoCache, setRepoCache])

  const github = useSettingsStore((s) => s.settings.github)
  const activeAccount = github?.accounts?.find((a) => a.id === github.activeAccountId) || null

  if (!activeRepo) return null

  return (
    <div className="flex h-full flex-col">
      <ActionToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

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


