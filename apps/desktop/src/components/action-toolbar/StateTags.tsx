import { useRepoUIStore } from '../../stores/repoUI.store'
import { goToRepoContent } from '../../stores/repoView.store'
import { useActiveBranchPr } from '../../hooks/useActiveBranchPr'
import { PrStatusTag } from '../common/PrStatusTag'

/**
 * Status tag for the active repo/workspace: the linked pull request (GitHub mark + status +
 * `#number`), when there is one. Detached HEAD and rebase/conflict are already surfaced via
 * BranchContext and the synthetic CONFLICT graph row, so they aren't duplicated here.
 *
 * The tag rides with the branch context, so it is on the bar for the graph *and* the files view —
 * but the PR page it opens is drawn by the graph alone. Clicking it from the files view therefore
 * has to bring that view back, or the click sets `activePrNumber` under a screen showing a file
 * tree and reads as a dead tag.
 */
export function StateTags() {
  const setActivePrNumber = useRepoUIStore((s) => s.setActivePrNumber)
  const activePr = useActiveBranchPr()

  if (!activePr) return null

  return (
    <div className="flex shrink-0 items-center gap-1">
      <PrStatusTag
        pr={activePr}
        onOpen={(pr) => {
          goToRepoContent()
          setActivePrNumber(pr.number)
        }}
      />
    </div>
  )
}
