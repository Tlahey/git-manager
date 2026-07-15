import { useRepoUIStore } from '../stores/repoUI.store'

/**
 * True when the graph's main content pane shows the plain, scrollable commit list — false while
 * it's swapped for a PR detail/composer/create screen or a file diff (mirrors the center-panel
 * conditional in `GitGraph.tsx`). Used to gate commit-search availability (toolbar button, ⌘F):
 * there's nothing to search when the commit list itself isn't on screen.
 */
export function useIsCommitsView(): boolean {
  const activePrNumber = useRepoUIStore((s) => s.activePrNumber)
  const activeDiffFile = useRepoUIStore((s) => s.activeDiffFile)
  const prComposer = useRepoUIStore((s) => s.prComposer)
  const prCreateOpen = useRepoUIStore((s) => s.prCreateOpen)
  return activePrNumber == null && !activeDiffFile && !prComposer && !prCreateOpen
}
