import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@git-manager/ui'
import { goToRepoContent } from '../../../stores/repoView.store'

/**
 * Most refs a repo can offer per kind before the list stops being worth building. cmdk filters
 * client-side, so every command is materialised whether or not it matches — a repo with a thousand
 * stale branches would pay for all of them on each keystroke. Refs are ordered by the branch/tag
 * list's own order, so the cap keeps the head of that list.
 */
export const MAX_REFS_PER_KIND = 60

/**
 * The single funnel for every palette entry that moves the repository — shared by the branch and the
 * tag commands, which is why it lives here rather than in either.
 *
 * It is also the right place to answer "where does the user see this happen": all of them land in
 * the graph, and the palette can be opened from the board or the files view. The dialog-based
 * entries deliberately do *not* come through here — their dialogs are mounted outside the view
 * switch (`RepoWorkspace`), so they already work whichever view is up, and dragging the user to the
 * graph to confirm a remote-tag deletion would be a detour, not a destination.
 */
export function useRefRunner(repoPath: string | null) {
  const queryClient = useQueryClient()

  return function run(action: () => Promise<unknown>, success: string) {
    goToRepoContent()
    action()
      .then(() => {
        toast.success(success)
        queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['tags', repoPath] })
      })
      .catch((err) => toast.error(String(err)))
  }
}
