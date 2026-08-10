import { Button, Spinner, LlmIcon } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { Check } from 'lucide-react'
import { WipBatchGroup } from './WipBatchGroup'
import type { WipCommitPanelState } from './wipPanelState'

interface WipBatchPanelProps {
  panel: WipCommitPanelState
  aiEnabled: boolean
}

/**
 * Batch mode: the working changes grouped by directory, one message and one commit per group.
 *
 * Distinct from the AI commit *plan* (`CommitBatchReviewPanel`), which asks a model to split the
 * changes and shows the result in a dialog — this one groups mechanically, by folder, and stays in
 * the panel.
 */
export function WipBatchPanel({ panel, aiEnabled }: WipBatchPanelProps) {
  const { t } = useTranslation('git')
  const {
    wipBatches,
    batchMessages,
    setBatchMessages,
    batchGenerating,
    generateMessageForBatch,
    commitBatch,
    generateAllBatchMessages,
    commitAllBatches,
    isGeneratingAllBatches,
    isCommittingAllBatches,
  } = panel

  const groupNames = Object.keys(wipBatches)
  const isSequenceBusy = isGeneratingAllBatches || isCommittingAllBatches

  return (
    <div className="animate-in space-y-4 pt-1 animate-duration-150 fade-in slide-in-from-top-1">
      <p className="border-b border-border/20 pb-1 text-[10px] leading-relaxed font-medium text-muted-foreground">
        {t('commitDetails.batchCommit.subtitle')}
      </p>

      {/* Run the whole plan in one go. Both are sequential — each group re-stages the index to
          isolate itself, so they cannot overlap. Hidden when there is nothing to group. */}
      {groupNames.length > 0 && (
        <div className="flex items-center gap-2">
          {aiEnabled && (
            <Button
              variant="outline"
              size="sm"
              data-testid="batch-generate-all"
              className="h-7 flex-1 gap-1 text-[10px] font-semibold"
              onClick={generateAllBatchMessages}
              disabled={isSequenceBusy}
            >
              {isGeneratingAllBatches ? (
                <Spinner className="h-2.5 w-2.5" />
              ) : (
                <LlmIcon className="h-3 w-3 text-primary" />
              )}
              <span>{t('commitDetails.batchCommit.generateAll')}</span>
            </Button>
          )}

          <Button
            size="sm"
            data-testid="batch-commit-all"
            className="h-7 flex-1 gap-1 text-[10px] font-semibold"
            onClick={commitAllBatches}
            disabled={
              isSequenceBusy ||
              // Nothing to do until at least one group carries a message.
              !groupNames.some((name) => batchMessages[name]?.trim())
            }
          >
            {isCommittingAllBatches ? (
              <Spinner className="h-2.5 w-2.5" />
            ) : (
              <Check className="h-3 w-3 text-white" />
            )}
            <span>{t('commitDetails.batchCommit.commitAll')}</span>
          </Button>
        </div>
      )}

      {groupNames.map((groupName) => {
        const files = wipBatches[groupName]
        return (
          <WipBatchGroup
            key={groupName}
            groupName={groupName}
            files={files}
            message={batchMessages[groupName] ?? ''}
            onMessageChange={(message) =>
              setBatchMessages((prev) => ({ ...prev, [groupName]: message }))
            }
            isGenerating={!!batchGenerating[groupName]}
            isSequenceBusy={isSequenceBusy}
            aiEnabled={aiEnabled}
            onGenerate={() => generateMessageForBatch(groupName, files)}
            onCommit={() => commitBatch(groupName, files)}
          />
        )
      })}
    </div>
  )
}
