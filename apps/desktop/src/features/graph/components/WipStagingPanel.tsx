import { useTranslation } from '@git-manager/i18n'
import { Layers } from 'lucide-react'
import type { GitStatus } from '@git-manager/git-types'
import { useWipCommitPanel } from '../hooks/useWipCommitPanel'
import { useCommitBatchReview } from '../hooks/useCommitBatchReview'
import { useAiEnabled } from '../../../hooks/useAiEnabled'
import { CommitBatchReviewPanel } from './CommitBatchReviewPanel'
import { WipPanelTabs } from './WipPanelTabs'
import { WipCommitForm } from './WipCommitForm'
import { WipStashForm } from './WipStashForm'
import { WipBatchPanel } from './WipBatchPanel'
import type { ProcessedFileItem } from '../../../components/common/CommitFileList'

interface WipStagingPanelProps {
  repoPath: string
  gitStatus: GitStatus | undefined
  allWipChanges: ProcessedFileItem[]
  onRefresh?: () => void
}

/**
 * Everything the WIP row offers below the graph, and the choice between three ways of doing it:
 * commit the index, stash it, or split it into a batch of per-directory commits.
 *
 * The panel itself only wires the state and picks the form; each form is its own component, and
 * they all read one `useWipCommitPanel` state rather than a slice each (see `wipPanelState.ts` for
 * why). The AI commit *plan* is a fourth path, but it lives in a dialog rather than in the panel —
 * `CommitBatchReviewPanel` mounts at the bottom and the commit form carries its trigger.
 */
export function WipStagingPanel({
  repoPath,
  gitStatus,
  allWipChanges,
  onRefresh,
}: WipStagingPanelProps) {
  const { t } = useTranslation('git')
  const aiEnabled = useAiEnabled()

  const panel = useWipCommitPanel(repoPath, gitStatus, allWipChanges, t, onRefresh)
  // Case 2: AI splits all working changes into a plan of atomic commits, reviewed in a dialog.
  const batchReview = useCommitBatchReview(repoPath, allWipChanges, t, onRefresh)

  return (
    <div
      data-testid="wip-staging-panel"
      className="space-y-3 border-t border-border/55 px-4 pt-2 pb-4"
    >
      <div className="flex items-center justify-between">
        <button
          data-testid="batch-mode-toggle"
          onClick={() => panel.setBatchMode((b) => !b)}
          className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-primary select-none hover:opacity-85"
        >
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span>
            {panel.batchMode
              ? t('commitDetails.batchCommit.back')
              : t('commitDetails.batchCommit.title')}
          </span>
        </button>
      </div>

      {panel.batchMode ? (
        <WipBatchPanel panel={panel} aiEnabled={aiEnabled} />
      ) : (
        /* Classic Staged / Unstaged List + Commit / Stash panel */
        <div className="space-y-1.5 pt-1">
          {/* The tabs bar sits just above the container, and overlaps its top border. */}
          <WipPanelTabs activeTab={panel.activeTab} onSelect={panel.setActiveTab} />

          <div className="space-y-3 rounded-tr-lg rounded-b-lg border border-border/40 bg-card p-3 shadow-xs">
            {panel.activeTab === 'commit' ? (
              <WipCommitForm
                panel={panel}
                repoPath={repoPath}
                gitStatus={gitStatus}
                aiEnabled={aiEnabled}
                hasWipChanges={allWipChanges.length > 0}
                onOpenBatchReview={batchReview.openAndGenerate}
                isBatchReviewGenerating={batchReview.isGenerating}
              />
            ) : (
              <WipStashForm panel={panel} gitStatus={gitStatus} />
            )}
          </div>
        </div>
      )}

      <CommitBatchReviewPanel review={batchReview} />
    </div>
  )
}
