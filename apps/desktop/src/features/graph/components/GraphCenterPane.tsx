import type { ReactNode } from 'react'
import type { RebaseProgressStep, RebaseState } from '@git-manager/git-types'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { usePatchWorkspaceStore } from '../../../stores/patchWorkspace.store'
import { usePackageHealthStore } from '../../../stores/packageHealth.store'
import { PatchWorkspaceCenter } from '../../../components/patch/PatchWorkspaceCenter'
import { PackageHealthCenter } from '../../../components/package-health/PackageHealthCenter'
import { PrDetailCenter } from '../../../components/github-panels/pr/PrDetailCenter'
import { PrFileDiffCenter } from '../../../components/github-panels/pr/PrFileDiffCenter'
import { PrCreateCenter } from '../../../components/github-panels/pr/PrCreateCenter'
import { PrComposerCenter } from '../../../components/github-panels/pr/PrComposerCenter'
import { IssueDetailCenter } from '../../../components/github-panels/issue/IssueDetailCenter'
import { DiffViewCenter } from '../../../components/diff-viewer/DiffViewCenter'
import { RebaseProgressCenter } from '../../../components/rebase-progress/RebaseProgressCenter'

interface GraphCenterPaneProps {
  repoPath: string
  /** The paused-rebase view, which is the one claimant the graph page owns rather than a store. */
  rebaseViewOpen: boolean
  rebaseState: RebaseState | null | undefined
  onSelectRebaseStep: (step: RebaseProgressStep) => void
  isRebaseStepSelectable: (step: RebaseProgressStep) => boolean
  selectedOid: string | null
  filesPanelOpen: boolean
  onToggleFilesPanel: () => void
  /** The commit graph itself — what shows when nothing above has claimed the centre. */
  children: ReactNode
}

/**
 * What fills the graph page's centre: one of eight screens, or the graph.
 *
 * The order is a priority, not a style: a patch workspace or a package-health report replaces the
 * whole view, a PR outranks an issue, and a PR's *file* outranks its conversation. Written as one
 * chain in one file so that priority is readable in twenty lines instead of inferred from the
 * nesting of a nine-hundred-line component.
 *
 * The discriminants are read from the stores here rather than threaded down as props. They are
 * store state to begin with, and passing them would have meant nineteen props whose only job was
 * to be compared against `null` — which is how the chain ended up inline in the first place.
 */
export function GraphCenterPane({
  repoPath,
  rebaseViewOpen,
  rebaseState,
  onSelectRebaseStep,
  isRebaseStepSelectable,
  selectedOid,
  filesPanelOpen,
  onToggleFilesPanel,
  children,
}: GraphCenterPaneProps): ReactNode {
  const patchMode = usePatchWorkspaceStore((s) => s.mode)
  const healthOpen = usePackageHealthStore((s) => s.open)
  const activePrNumber = useRepoUIStore((s) => s.activePrNumber)
  const setActivePrNumber = useRepoUIStore((s) => s.setActivePrNumber)
  const activePrFile = useRepoUIStore((s) => s.activePrFile)
  const setActivePrFile = useRepoUIStore((s) => s.setActivePrFile)
  const activeIssue = useRepoUIStore((s) => s.activeIssue)
  const setActiveIssue = useRepoUIStore((s) => s.setActiveIssue)
  const prCreateOpen = useRepoUIStore((s) => s.prCreateOpen)
  const prComposer = useRepoUIStore((s) => s.prComposer)
  const activeDiffFile = useRepoUIStore((s) => s.activeDiffFile)
  const setActiveDiffFile = useRepoUIStore((s) => s.setActiveDiffFile)

  if (patchMode) return <PatchWorkspaceCenter repoPath={repoPath} />
  if (healthOpen) return <PackageHealthCenter repoPath={repoPath} />

  if (activePrNumber != null) {
    return activePrFile != null ? (
      <PrFileDiffCenter
        repoPath={repoPath}
        prNumber={activePrNumber}
        filename={activePrFile}
        onClose={() => setActivePrFile(null)}
      />
    ) : (
      <PrDetailCenter
        repoPath={repoPath}
        prNumber={activePrNumber}
        onClose={() => setActivePrNumber(null)}
      />
    )
  }

  if (activeIssue != null) {
    return (
      // The repo's own path, not the `owner/repo` the Launchpad passes: `useRepoGitHub` resolves
      // GitHub from the repo's remotes, which is exactly what the sidebar's issues came from.
      <IssueDetailCenter
        repoPath={repoPath}
        issueNumber={activeIssue.number}
        issue={activeIssue}
        onClose={() => setActiveIssue(null)}
      />
    )
  }

  if (prCreateOpen) return <PrCreateCenter repoPath={repoPath} />
  if (prComposer != null) return <PrComposerCenter repoPath={repoPath} />

  if (activeDiffFile) {
    return (
      <DiffViewCenter
        repoPath={repoPath}
        file={activeDiffFile}
        onClose={() => setActiveDiffFile(null)}
      />
    )
  }

  if (rebaseViewOpen && rebaseState) {
    return (
      <RebaseProgressCenter
        repoPath={repoPath}
        rebaseState={rebaseState}
        onSelectStep={onSelectRebaseStep}
        isStepSelectable={isRebaseStepSelectable}
        selectedOid={selectedOid}
        filesPanelOpen={filesPanelOpen}
        onToggleFilesPanel={onToggleFilesPanel}
      />
    )
  }

  return children
}
