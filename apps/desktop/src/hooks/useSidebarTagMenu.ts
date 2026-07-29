import { useTranslation } from '@git-manager/i18n'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useTagContextMenu } from './useTagContextMenu'

/**
 * The tag action menu, mounted outside the commit graph so the sidebar's tag rows can open it.
 *
 * Reuses {@link useTagContextMenu} verbatim rather than restating the menu: the sidebar and the
 * graph's tag badge must not drift into two different menus. The two commit-scoped dependencies it
 * normally takes from the graph are supplied here through the shared "pending graph action" bridge
 * in `repoUI.store` — the same route the command palette uses to act on a commit from outside the
 * graph. The tag's commit is selected when the menu opens, well before any item is picked, so the
 * dialogs those items raise always land on the right commit.
 *
 * Mirrors {@link useSidebarBranchMenu}: the caller renders the dialogs from the returned state.
 */
export function useSidebarTagMenu(repoPath: string) {
  const { t } = useTranslation('git')
  const repo = useRepoDataStore((s) => s.repoCache[repoPath])
  const setPendingGraphSelection = useRepoUIStore((s) => s.setPendingGraphSelection)
  const setPendingGraphAction = useRepoUIStore((s) => s.setPendingGraphAction)

  return useTagContextMenu({
    repoPath,
    currentBranch: repo && !repo.isDetached ? repo.head : null,
    isDetached: repo?.isDetached ?? false,
    selectCommit: setPendingGraphSelection,
    setPendingCommitAction: setPendingGraphAction,
    t,
  })
}
