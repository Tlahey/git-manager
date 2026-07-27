import { useTranslation } from '@git-manager/i18n'
import { SidePanelOverlay } from '@git-manager/components'
import {
  Button,
  Checkbox,
  DialogDescription,
  DialogTitle,
  Progress,
  ScrollArea,
  Spinner,
  Textarea,
  cn,
  LlmIcon,
} from '@git-manager/ui'
import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import type { CommitBatchReview } from '../../../hooks/useCommitBatchReview'

const statusLetters: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  untracked: '?',
}

const statusColors: Record<string, string> = {
  added: 'text-green-500',
  modified: 'text-yellow-500',
  deleted: 'text-red-500',
  renamed: 'text-blue-500',
  untracked: 'text-muted-foreground',
}

/**
 * The review screen for case 2 ("generate commit batches"): the AI's proposed commit plan, each
 * commit editable and individually accept/reject-able, then applies the accepted ones. Purely
 * presentational — all state/logic lives in {@link useCommitBatchReview}, passed in as `review`.
 *
 * A right-hand side panel rather than a centered dialog, because the content is a list you read
 * through: a plan over a busy working tree runs to a dozen commit cards, each with its own file
 * list, and a centered box could only ever show two or three of them.
 *
 * The scrolling middle is `min-h-0 flex-1`, and that is load-bearing. It used to be a
 * `max-h-[52vh]` `ScrollArea`, which does not scroll at all: Radix's viewport is `h-full`, a
 * percentage height resolves against a *max*-height parent as `auto`, so the viewport grew with the
 * content, never overflowed itself, got no scrollbar — and the root's `overflow-hidden` simply cut
 * the rest off. Only a parent with a resolved height (which is what `flex-1` gives it) makes it
 * scroll.
 */
export function CommitBatchReviewPanel({ review }: { review: CommitBatchReview }) {
  const { t } = useTranslation('git')
  const {
    isOpen,
    close,
    isGenerating,
    isApplying,
    error,
    proposals,
    setMessage,
    toggleAccepted,
    applyAccepted,
    regenerate,
    canApply,
    acceptedCount,
    validations,
    reconciliation,
    progress,
    hasStagedChanges,
  } = review

  return (
    <SidePanelOverlay
      open={isOpen}
      onClose={close}
      testIdPrefix="ai-batch"
      widthRatios={{ initial: 0.42, min: 0.28, max: 0.85 }}
    >
      <div className="flex h-full min-h-0 flex-col" data-testid="ai-batch-dialog">
        <div className="shrink-0 space-y-1 border-b border-border/60 px-5 py-4 pr-10">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <LlmIcon className="h-4 w-4 text-primary" />
            {t('commitDetails.aiBatch.title')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t('commitDetails.aiBatch.subtitle')}
          </DialogDescription>
        </div>

        {isGenerating ? (
          <div
            data-testid="ai-batch-loading"
            className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-xs text-muted-foreground"
          >
            <Spinner className="h-5 w-5 text-primary" />
            {/* The two-phase planner makes one call per file, so on a large changeset this runs for
                minutes. A bare spinner there reads as a hang — it has to say which file it is on. */}
            {progress ? (
              <div className="w-full space-y-1.5" data-testid="ai-batch-progress">
                <p className="text-center">
                  {progress.phase === 'summarizing'
                    ? t('commitDetails.aiBatch.summarizing', {
                        done: progress.completed,
                        total: progress.total,
                      })
                    : t('commitDetails.aiBatch.grouping')}
                </p>
                <Progress
                  value={
                    progress.phase === 'composing'
                      ? 100
                      : Math.round((progress.completed / Math.max(1, progress.total)) * 100)
                  }
                />
                <p className="text-center text-[10px]">
                  {t('commitDetails.aiBatch.cancelHint')}
                </p>
              </div>
            ) : (
              t('commitDetails.aiBatch.analyzing')
            )}
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5">
            <p data-testid="ai-batch-error" className="text-center text-xs text-destructive">
              {error}
            </p>
            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={regenerate}>
              <RefreshCw className="h-3 w-3" />
              {t('commitDetails.aiBatch.regenerate')}
            </Button>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1" data-testid="ai-batch-scroll">
            <div className="space-y-3 px-5 py-4">
              {/* Applying is not a commit on top of what the user staged — it resets the index and
                  rebuilds it per proposal, so a hand-picked selection does not survive. Said before
                  the button rather than discovered after it, but only when there is a selection to
                  lose: shown to someone with nothing staged it warns about an impossible loss, and
                  a warning that is usually irrelevant stops being read. */}
              {hasStagedChanges && (
                <p
                  data-testid="ai-batch-staging-notice"
                  className="text-[10px] text-muted-foreground"
                >
                  {t('commitDetails.aiBatch.stagingNotice')}
                </p>
              )}
              {/* What the plan lost on the way in. A warning rather than information, unlike the
                  coverage line: coverage means the model read less, this means it produced a plan
                  the working tree could not accept — the commits on screen are fewer, or hold fewer
                  files, than the ones it proposed. */}
              {reconciliation && (
                <div
                  data-testid="ai-batch-reconciliation"
                  className="flex items-start gap-1.5 rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-[10px] text-yellow-600 dark:text-yellow-400"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <p>
                    {t('commitDetails.aiBatch.reconciliation', {
                      discarded: reconciliation.discardedProposals,
                      unknown: reconciliation.unknownPaths.length,
                      duplicate: reconciliation.duplicatePaths.length,
                    })}
                  </p>
                </div>
              )}
              {proposals.map((proposal, index) => (
                <div
                  key={index}
                  data-testid={`ai-batch-proposal-${index}`}
                  className={cn(
                    'space-y-2 rounded-lg border p-3 transition-colors',
                    proposal.accepted
                      ? 'border-primary/40 bg-muted/10'
                      : 'border-border/40 opacity-60'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      data-testid={`ai-batch-accept-${index}`}
                      checked={proposal.accepted}
                      onChange={() => toggleAccepted(index)}
                    />
                    <span
                      className={cn(
                        'text-xs font-bold',
                        proposal.kind === 'unplaced' ? 'text-yellow-600 dark:text-yellow-400' : 'text-primary'
                      )}
                    >
                      {proposal.kind === 'unplaced'
                        ? t('commitDetails.aiBatch.unplacedLabel')
                        : t('commitDetails.aiBatch.commitLabel', { index: index + 1 })}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {t('commitDetails.aiBatch.fileCount', { count: proposal.files.length })}
                    </span>
                  </div>

                  <Textarea
                    data-testid={`ai-batch-message-${index}`}
                    value={proposal.commitMessage}
                    onChange={(e) => setMessage(index, e.target.value)}
                    placeholder={t('commitDetails.aiBatch.messagePlaceholder')}
                    rows={2}
                    disabled={!proposal.accepted}
                    className="resize-none font-mono text-[11px]"
                  />

                  {/* Shown whether or not it is accepted, unlike every other hint here. Unticked is
                      this group's *default*, so a hint that waits for the tick explains a disabled,
                      greyed-out, empty card only to someone who already worked out what it was. */}
                  {proposal.kind === 'unplaced' && (
                    <p
                      data-testid={`ai-batch-unplaced-hint-${index}`}
                      className="text-[10px] text-muted-foreground"
                    >
                      {t('commitDetails.aiBatch.unplacedHint')}
                    </p>
                  )}

                  {/* An accepted group with no message is skipped at apply time rather than
                      committed subjectless — that is the unplaced group until the user writes one,
                      and saying so beats a silently smaller commit count. It takes the place of the
                      convention warning, which on an empty subject only restates the same thing. */}
                  {proposal.accepted && !proposal.commitMessage.trim() ? (
                    <div
                      data-testid={`ai-batch-empty-${index}`}
                      className="flex items-start gap-1.5 rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-[10px] text-yellow-600 dark:text-yellow-400"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <p>{t('commitDetails.aiBatch.emptyMessage')}</p>
                    </div>
                  ) : proposal.accepted && !validations[index]?.valid ? (
                    <div
                      data-testid={`ai-batch-warning-${index}`}
                      className="flex items-start gap-1.5 rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-[10px] text-yellow-600 dark:text-yellow-400"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <div className="space-y-0.5">
                        <p className="font-semibold">
                          {t('commitDetails.aiBatch.conventionWarning')}
                        </p>
                        {validations[index]?.problems.map((p) => <p key={p.code}>{p.message}</p>)}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-0.5 rounded border border-border/30 bg-card p-1.5">
                    {proposal.files.map((file) => (
                      <div
                        key={file.path}
                        className="flex items-center gap-1.5 font-mono text-[10px]"
                      >
                        <span
                          className={cn(
                            'min-w-[10px] shrink-0 text-center font-bold',
                            statusColors[file.status]
                          )}
                        >
                          {statusLetters[file.status] ?? 'M'}
                        </span>
                        <span className="truncate text-foreground">{file.path}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex shrink-0 items-center gap-2 border-t border-border/60 px-5 py-3">
          {!isGenerating && !error && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto gap-1 text-xs"
              onClick={regenerate}
              disabled={isApplying}
            >
              <RefreshCw className="h-3 w-3" />
              {t('commitDetails.aiBatch.regenerate')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs"
            onClick={close}
            disabled={isApplying}
          >
            {t('commitDetails.aiBatch.cancel')}
          </Button>
          <Button
            size="sm"
            data-testid="ai-batch-apply"
            className="gap-1 text-xs"
            onClick={applyAccepted}
            disabled={!canApply || isApplying || isGenerating}
          >
            {isApplying ? <Spinner className="h-3 w-3" /> : <Check className="h-3 w-3" />}
            {t('commitDetails.aiBatch.apply', { count: acceptedCount })}
          </Button>
        </div>
      </div>
    </SidePanelOverlay>
  )
}
