import type { GitGraphNode } from '@git-manager/git-types'
import { useRepoUIStore, type ActiveDiffFile } from '../../../stores/repoUI.store'
import { usePatchWorkspaceStore } from '../../../stores/patchWorkspace.store'
import { usePackageHealthStore } from '../../../stores/packageHealth.store'
import { GraphSidePanel } from './GraphSidePanel'
import { AiSidePanel } from './AiSidePanel'
import { BisectPanel } from '../../../components/bisect/BisectPanel'
import { PatchWorkspacePanel } from '../../../components/patch/PatchWorkspacePanel'
import { PackageHealthPanel } from '../../../components/package-health/PackageHealthPanel'
import { PrFilesPanel } from '../../../components/github-panels/pr/PrFilesPanel'
import { ConflictResolutionPanel } from './ConflictResolutionPanel'
import { MultiCommitDetailsPanel } from './MultiCommitDetailsPanel'
import { CommitDetailsPanel } from './CommitDetailsPanel'

interface GraphSidePanelSlotProps {
  repoPath: string
  /** Spread on the drag handle, and the width it produces — one resize for whatever is showing. */
  resizeProps: React.ComponentProps<typeof GraphSidePanel>['resizeProps']
  width: number

  bisectActive: boolean
  /** The graph's own reasons to show nothing: a previewed history, or a dismissed conflict row. */
  timelinePreviewOpen: boolean
  isDismissedConflictRow: boolean
  primaryNode: GitGraphNode | null | undefined

  isConflictPanelOpen: boolean
  onCloseConflictPanel: () => void
  isMultiSelect: boolean
  selectedCommitNodes: GitGraphNode[]
  isSelectedCommitHead: boolean
  onSelectCommit: (oid: string) => void
  onSelectFileDiff: (file: ActiveDiffFile) => void
  onClearSelection: () => void
}

/**
 * What fills the graph page's right-hand slot, or nothing.
 *
 * The counterpart to `GraphCenterPane`, and the same kind of decision: a priority order over
 * mutually exclusive claimants — bisect first, then the AI panels, the patch workspace, package
 * health, a PR's files, and finally the selected commit. Reading it as one chain is the point;
 * inline it was the deepest nesting in a nine-hundred-line component, and the order it encodes was
 * only visible by counting closing parens.
 *
 * Store-backed claimants are read here rather than passed in, as in `GraphCenterPane`. What *is*
 * passed is what the graph alone knows: which commits are selected, whether the timeline is
 * previewing a history the repository does not have yet, and the shared resize handle.
 */
export function GraphSidePanelSlot({
  repoPath,
  resizeProps,
  width,
  bisectActive,
  timelinePreviewOpen,
  isDismissedConflictRow,
  primaryNode,
  isConflictPanelOpen,
  onCloseConflictPanel,
  isMultiSelect,
  selectedCommitNodes,
  isSelectedCommitHead,
  onSelectCommit,
  onSelectFileDiff,
  onClearSelection,
}: GraphSidePanelSlotProps) {
  const aiPanelTarget = useRepoUIStore((s) => s.aiPanelTarget)
  const setAiPanelTarget = useRepoUIStore((s) => s.setAiPanelTarget)
  const activePrNumber = useRepoUIStore((s) => s.activePrNumber)
  const prFilesVisible = useRepoUIStore((s) => s.prFilesVisible)
  const conflictFilePath = useRepoUIStore((s) => s.conflictFilePath)
  const setConflictFilePath = useRepoUIStore((s) => s.setConflictFilePath)
  const patchMode = usePatchWorkspaceStore((s) => s.mode)
  const healthOpen = usePackageHealthStore((s) => s.open)

  /** Every claimant shares the same resizable shell, so it is applied once here. */
  const panel = (children: React.ReactNode) => (
    <GraphSidePanel resizeProps={resizeProps} width={width}>
      {children}
    </GraphSidePanel>
  )

  if (bisectActive) return panel(<BisectPanel repoPath={repoPath} />)

  if (aiPanelTarget) {
    return panel(
      <AiSidePanel
        repoPath={repoPath}
        target={aiPanelTarget}
        onClose={() => setAiPanelTarget(null)}
      />
    )
  }

  if (patchMode) return panel(<PatchWorkspacePanel repoPath={repoPath} />)
  if (healthOpen) return panel(<PackageHealthPanel repoPath={repoPath} />)

  // A PR claims the slot only to list its files, and only while that list is toggled on — with it
  // hidden the slot stays empty rather than falling through to the commit behind the PR.
  if (activePrNumber != null) {
    return prFilesVisible
      ? panel(<PrFilesPanel repoPath={repoPath} prNumber={activePrNumber} />)
      : null
  }

  if (timelinePreviewOpen || !primaryNode || isDismissedConflictRow) return null

  if (isConflictPanelOpen) {
    return panel(
      <ConflictResolutionPanel
        repoPath={repoPath}
        activeFile={conflictFilePath}
        onSelectFile={setConflictFilePath}
        onClose={onCloseConflictPanel}
      />
    )
  }

  if (isMultiSelect) {
    return panel(
      <MultiCommitDetailsPanel
        nodes={selectedCommitNodes}
        repoPath={repoPath}
        onSelectFileDiff={onSelectFileDiff}
        onClose={onClearSelection}
      />
    )
  }

  return panel(
    <CommitDetailsPanel
      node={primaryNode}
      repoPath={repoPath}
      isHead={isSelectedCommitHead}
      onSelectCommit={onSelectCommit}
      onSelectFileDiff={onSelectFileDiff}
      onClose={onClearSelection}
    />
  )
}
