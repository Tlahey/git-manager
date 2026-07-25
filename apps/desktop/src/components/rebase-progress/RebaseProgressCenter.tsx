import { ScrollArea } from '@git-manager/ui'
import type { RebaseProgressStep, RebaseState } from '@git-manager/git-types'
import { useRebaseViewStore } from '../../stores/rebaseView.store'
import { useRebaseControls } from '../../hooks/useRebaseControls'
import { useConflictedFiles } from '../../hooks/useConflictedFiles'
import { useGitStatus } from '../../hooks/useGitStatus'
import { RebaseProgressHeader } from './components/RebaseProgressHeader'
import { RebaseStepList } from './components/RebaseStepList'
import { RebaseProgressActions } from './components/RebaseProgressActions'
import { countDoneSteps } from './rebaseStepView'

interface RebaseProgressCenterProps {
  repoPath: string
  /** Fetched once by `GitGraph` (which polls it for the graph's CONFLICT row) and passed down. */
  rebaseState: RebaseState
  /**
   * Opening a step. The caller routes it: the paused step shows the conflicted files (that's the
   * step with work to do), any other one selects its commit in the graph.
   */
  onSelectStep?: (step: RebaseProgressStep) => void
  /** Whether a non-paused step's commit is actually loaded in the graph — see `RebaseStepList`. */
  isStepSelectable?: (step: RebaseProgressStep) => boolean
  selectedOid?: string | null
  /** Whether the right-hand conflicted-files panel is up, and how to flip it. Owned by `GitGraph`:
   * showing it again means re-selecting the graph row the panel hangs off. */
  filesPanelOpen?: boolean
  onToggleFilesPanel?: () => void
}

/**
 * Center-panel view of a rebase in progress: the whole todo list as a rail, with the step git is
 * stopped on marked, plus the way out (continue / skip / abort).
 *
 * It exists because a paused rebase used to be visible only through the conflicted files in the
 * right-hand panel — enough to fix a file, not enough to know how many steps are left, which
 * commit is being replayed, or what it's being replayed onto. "Hide" hands the center back to the
 * commit graph, whose synthetic CONFLICT row re-opens this view (see `useRebaseViewStore`).
 */
export function RebaseProgressCenter({
  repoPath,
  rebaseState,
  onSelectStep,
  isStepSelectable,
  selectedOid,
  filesPanelOpen,
  onToggleFilesPanel,
}: RebaseProgressCenterProps) {
  const hideProgress = useRebaseViewStore((s) => s.hideProgress)
  const { data: status } = useGitStatus(repoPath)
  // Same source as the conflict panel (not `rebaseState.conflictedFiles`, which only refreshes
  // with the whole rebase state) so resolving the last file enables Continue in both at once.
  const { data: conflictedFiles = [] } = useConflictedFiles(repoPath)

  const paused = rebaseState.kind === 'conflict' || rebaseState.kind === 'edit_pause'
  // Same gating as the conflict panel: continue once nothing is conflicted, skip only while the
  // user has staged nothing — a step with staged fixes is meant to be continued, not dropped.
  const allResolved = conflictedFiles.length === 0
  const canSkip = conflictedFiles.length > 0 && (status?.staged?.length ?? 0) === 0

  const { pending, error, continueRebase, skipStep, abortRebase } = useRebaseControls(repoPath)

  // git's own counters (`msgnum`/`end`) are authoritative; the parsed plan covers the backends
  // that don't write them.
  const currentStep =
    rebaseState.currentStep ?? countDoneSteps(rebaseState.steps) + (paused ? 1 : 0)
  const totalSteps = rebaseState.totalSteps ?? rebaseState.steps.length

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="rebase-progress-center">
      <RebaseProgressHeader
        rebaseState={rebaseState}
        currentStep={totalSteps > 0 ? currentStep : undefined}
        totalSteps={totalSteps > 0 ? totalSteps : undefined}
        filesPanelOpen={filesPanelOpen}
        onToggleFilesPanel={onToggleFilesPanel}
        onHide={() => hideProgress(repoPath)}
      />

      <ScrollArea className="min-h-0 flex-1">
        <RebaseStepList
          rebaseState={rebaseState}
          conflictedCount={conflictedFiles.length}
          onSelectStep={onSelectStep}
          isStepSelectable={isStepSelectable}
          selectedOid={selectedOid}
          currentStepActive={filesPanelOpen}
        />
      </ScrollArea>

      <RebaseProgressActions
        paused={paused}
        allResolved={allResolved}
        canSkip={canSkip}
        pending={pending}
        error={error}
        onContinue={() => continueRebase()}
        onSkip={skipStep}
        onAbort={abortRebase}
      />
    </div>
  )
}
