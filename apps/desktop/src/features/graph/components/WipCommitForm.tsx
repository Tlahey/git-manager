import { SplitButton } from '@git-manager/components'
import { Button, Textarea, Checkbox, Progress, Spinner, LlmIcon } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { AlertTriangle, ShieldOff, Square } from 'lucide-react'
import type { GitStatus } from '@git-manager/git-types'
import { PrPublishButton } from '../../../components/github-panels/pr/PrPublishButton'
import type { WipCommitPanelState } from './wipPanelState'

interface WipCommitFormProps {
  panel: WipCommitPanelState
  repoPath: string
  gitStatus: GitStatus | undefined
  aiEnabled: boolean
  /** Whether anything is pending at all — gates the AI plan trigger, which groups *all* changes. */
  hasWipChanges: boolean
  /** Opens the AI commit-plan dialog (see `useCommitBatchReview`). */
  onOpenBatchReview: () => void
  isBatchReviewGenerating: boolean
}

/**
 * The commit half of the WIP panel: the message box, its generation progress and convention
 * warning, the amend toggle, the commit button and the two flows that start from a written message
 * (publish a PR, or ask the AI for a commit plan).
 */
export function WipCommitForm({
  panel,
  repoPath,
  gitStatus,
  aiEnabled,
  hasWipChanges,
  onOpenBatchReview,
  isBatchReviewGenerating,
}: WipCommitFormProps) {
  const { t } = useTranslation('git')
  const {
    commitMessage,
    setCommitMessage,
    isGenerating,
    commitProgress,
    commitValidation,
    isAmend,
    handleToggleAmend,
    handleGenerateCommitMessage,
    handleCommitWip,
    isCommitting,
  } = panel

  const stagedCount = gitStatus?.staged?.length ?? 0

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Textarea
          data-testid="commit-message-input"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder={t('commit.placeholder')}
          rows={3}
          className="resize-none font-mono text-xs"
          disabled={isGenerating}
        />
        {/* One call per staged file, so on a large change this runs for a while. The Stop
            button alone does not say what it is waiting on — the count does. */}
        {commitProgress && (
          <div className="space-y-1" data-testid="commit-message-progress">
            <p className="text-[10px] text-muted-foreground">
              {commitProgress.phase === 'summarizing'
                ? t('commit.summarizing', {
                    done: commitProgress.completed,
                    total: commitProgress.total,
                  })
                : t('commit.composing')}
            </p>
            <Progress
              value={
                commitProgress.phase === 'composing'
                  ? 100
                  : Math.round((commitProgress.completed / Math.max(1, commitProgress.total)) * 100)
              }
            />
          </div>
        )}
        {commitValidation && !commitValidation.valid && (
          <div
            data-testid="commit-validation-warning"
            className="flex items-start gap-1.5 rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-1.5 text-[10px] text-yellow-600 dark:text-yellow-400"
          >
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-semibold">{t('commit.conventionWarning')}</p>
              {commitValidation.problems.map((p) => (
                <p key={p.code}>{p.message}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Checkbox placement: BELOW the text area */}
      <label
        data-testid="commit-amend-checkbox-label"
        className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground select-none hover:text-foreground"
      >
        <Checkbox
          data-testid="commit-amend-checkbox"
          checked={isAmend}
          onChange={(e) => handleToggleAmend(e.target.checked)}
        />
        <span>
          {t('conflictEditor.amendPreviousCommit', {
            defaultValue: 'Amender le commit précédent',
          })}
        </span>
      </label>

      <div className="flex gap-2">
        {aiEnabled && (
          <Button
            variant="outline"
            size="sm"
            data-testid="commit-generate-button"
            className="h-8 flex-1 gap-1 text-xs"
            onClick={handleGenerateCommitMessage}
            disabled={stagedCount === 0 && !isGenerating}
          >
            {isGenerating ? (
              <>
                <Square className="h-3 w-3 animate-pulse text-destructive" />
                {t('commit.stop')}
              </>
            ) : (
              <>
                <LlmIcon className="h-3 w-3 text-primary" />
                {t('commit.generate')}
              </>
            )}
          </Button>
        )}

        <div className="flex-1">
          <SplitButton
            size="sm"
            fullWidth
            testIdPrefix="commit"
            label={isAmend ? t('commit.amend', { defaultValue: 'Amend' }) : t('commit.commit')}
            {...(isCommitting ? { icon: <Spinner className="h-3 w-3" /> } : {})}
            onClick={() => void handleCommitWip()}
            busy={isCommitting}
            // An amend needs no staged file — it rewrites the previous commit's message on its own.
            disabled={(stagedCount === 0 && !isAmend) || !commitMessage.trim()}
            menuLabel={t('commit.options')}
            actions={[
              {
                key: 'skip-hooks',
                label: t('commit.skipHooks'),
                icon: <ShieldOff className="h-3.5 w-3.5 text-muted-foreground" />,
                onSelect: () => void handleCommitWip({ skipHooks: true }),
              },
            ]}
          />
        </div>
      </div>

      {/* Commit + push + open a GitHub PR flow */}
      <PrPublishButton
        repoPath={repoPath}
        commitMessage={commitMessage}
        disabled={stagedCount === 0 || !commitMessage.trim() || isCommitting}
      />

      {/* AI Batch atomic commits dialog trigger */}
      {aiEnabled && (
        <Button
          variant="outline"
          size="sm"
          data-testid="ai-batch-generate-button"
          className="h-8 w-full gap-1.5 text-xs"
          onClick={onOpenBatchReview}
          disabled={!hasWipChanges || isBatchReviewGenerating}
        >
          <LlmIcon className="h-3.5 w-3.5 text-primary" />
          {t('commitDetails.aiBatch.trigger')}
        </Button>
      )}
    </div>
  )
}
