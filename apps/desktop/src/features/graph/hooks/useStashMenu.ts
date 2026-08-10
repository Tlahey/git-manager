import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { toast } from '@git-manager/ui'
import { showNativeMenu } from '../../../api/nativeMenu.api'
import { apiStashApply, apiStashPop, apiStashDrop } from '../../../api/git.api'
import { buildStashMenuSpec } from '../../../lib/graphContextMenus'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { refreshLogAndStatus } from '../lib/graphQueryRefresh'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

interface UseStashMenuParams {
  repoPath: string
  /** Stash oids currently kept out of the graph — drives the menu's show/hide item. */
  hiddenStashes: string[]
  /**
   * Selects the stash's row, called before renaming it so the inline editor opens on the right one.
   * The two callers select differently — the graph moves its own selection, the sidebar publishes
   * the branch selection the graph then follows — which is the only thing that differs between
   * them, and the reason it is a parameter rather than something this hook does itself.
   */
  selectRow: (oid: string) => void
  /** Shows/hides the stash's badge in the graph. A parameter rather than a store read because the
   *  graph receives it from `GitGraph` alongside `hiddenStashes`, and the pair must stay together. */
  toggleStashVisibility: (repoPath: string, oid: string) => void
  t: TranslateFn
}

/**
 * The stash context menu, shared by the graph's stash rows and the sidebar's Stashes section.
 *
 * These were two independent copies of the same five handlers with the same refresh set, one in
 * `useGraphRowMenus` and one in `RepositorySidebar`, and the duplication was live: a stash menu is
 * the same offer wherever the row is drawn, so a fix applied to one silently left the other behind.
 *
 * The palette's `useStashCommands` deliberately stays separate — it offers apply/pop/drop as
 * *commands*, with no menu and no row to select, so it shares the API calls rather than this.
 */
export function useStashMenu({
  repoPath,
  hiddenStashes,
  selectRow,
  toggleStashVisibility,
  t,
}: UseStashMenuParams) {
  const queryClient = useQueryClient()
  const setEditingOid = useRepoUIStore((s) => s.setEditingOid)

  return function openStashMenu(oid: string, index: number) {
    async function runStash(fn: () => Promise<unknown>) {
      try {
        await fn()
        mutate(['git-stashes', repoPath])
        refreshLogAndStatus(queryClient, repoPath)
      } catch (err) {
        toast.error(String(err))
      }
    }

    void showNativeMenu(
      buildStashMenuSpec(
        { isHidden: hiddenStashes.includes(oid) },
        {
          onApply: () => void runStash(() => apiStashApply(repoPath, index)),
          onPop: () => void runStash(() => apiStashPop(repoPath, index)),
          onDelete: () => void runStash(() => apiStashDrop(repoPath, index)),
          onEditMessage: () => {
            selectRow(oid)
            setEditingOid(oid)
          },
          onToggleVisibility: () => toggleStashVisibility(repoPath, oid),
        },
        t
      )
    ).catch(console.error)
  }
}
