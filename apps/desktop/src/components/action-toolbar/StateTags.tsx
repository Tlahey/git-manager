import { useRepoUIStore } from '../../stores/repoUI.store'
import { useActiveBranchPr } from '../../hooks/useActiveBranchPr'
import { PrStatusTag } from '../repository-sidebar/PrStatusTag'

/**
 * Status tag for the active repo/workspace: the linked pull request (GitHub mark + status +
 * `#number`), when there is one. Detached HEAD and rebase/conflict are already surfaced via
 * BranchContext and the synthetic CONFLICT graph row, so they aren't duplicated here.
 */
export function StateTags() {
  const setActivePrNumber = useRepoUIStore((s) => s.setActivePrNumber)
  const activePr = useActiveBranchPr()

  if (!activePr) return null

  return (
    <div className="flex shrink-0 items-center gap-1">
      <PrStatusTag pr={activePr} onOpen={(pr) => setActivePrNumber(pr.number)} />
    </div>
  )
}
