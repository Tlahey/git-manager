import { AiCommitSearchPanel } from './AiCommitSearchPanel'
import { WorkingExplanationPanel } from './WorkingExplanationPanel'
import { BranchExplanationPanel } from './BranchExplanationPanel'
import { DailySummariesPanel } from './DailySummariesPanel'
import { CodeReviewPanel } from './CodeReviewPanel'
import { CommitExplanationPanel } from './CommitExplanationPanel'
import type { AiPanelTarget } from '../../../stores/repoUI.store'

interface AiSidePanelProps {
  repoPath: string
  /** Which of the seven AI surfaces the right-hand slot is currently claimed by. */
  target: AiPanelTarget
  onClose: () => void
}

/**
 * The AI half of the graph's right-hand slot: one panel per `AiPanelTarget` kind.
 *
 * A single component rather than seven conditionals inside `GitGraph` because the union is the
 * decision — `repoUI.store`'s `AiPanelTarget` exists precisely so two of these can never claim the
 * slot at once, and a `switch` over it is that guarantee written out. Adding an eighth AI surface
 * is a case here rather than another arm in a page that already had six.
 *
 * The panels that name a subject are keyed on it, so switching from one branch (or commit) to
 * another remounts with *that* subject's remembered explanation instead of the previous one's.
 * `summaries` and `search` name none — the search's subject is the question the user is about to
 * type, which the panel owns — so neither needs keying.
 */
export function AiSidePanel({ repoPath, target, onClose }: AiSidePanelProps) {
  switch (target.kind) {
    case 'search':
      return <AiCommitSearchPanel repoPath={repoPath} onClose={onClose} />
    case 'working':
      return <WorkingExplanationPanel repoPath={repoPath} onClose={onClose} />
    case 'branch':
      return (
        <BranchExplanationPanel
          key={`branch:${target.branch}`}
          repoPath={repoPath}
          branch={target.branch}
          baseRef={target.baseRef}
          onClose={onClose}
        />
      )
    case 'summaries':
      return <DailySummariesPanel repoPath={repoPath} onClose={onClose} />
    case 'reviewWorking':
      return <CodeReviewPanel repoPath={repoPath} target={{ scope: 'working' }} onClose={onClose} />
    case 'reviewBranch':
      return (
        <CodeReviewPanel
          key={`review:${target.branch}`}
          repoPath={repoPath}
          target={{ scope: 'branch', branch: target.branch }}
          baseRef={target.baseRef}
          onClose={onClose}
        />
      )
    case 'commit':
      return (
        <CommitExplanationPanel
          key={`commit:${target.oid}`}
          repoPath={repoPath}
          commit={target}
          onClose={onClose}
        />
      )
  }
}
