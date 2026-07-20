import { useTranslation } from '@git-manager/i18n'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Textarea,
  cn,
} from '@git-manager/ui'
import { AlertTriangle, Check, Loader2, RefreshCw, Sparkles } from 'lucide-react'
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

/** The review screen for case 2 ("generate commit batches"): shows the AI's proposed commit plan,
 * each commit editable and individually accept/reject-able, then applies the accepted ones. Purely
 * presentational — all state/logic lives in {@link useCommitBatchReview}, passed in as `review`. */
export function CommitBatchReviewDialog({ review }: { review: CommitBatchReview }) {
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
  } = review

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && close()}>
      <DialogContent className="flex max-h-[80vh] w-[560px] flex-col gap-3" data-testid="ai-batch-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('commitDetails.aiBatch.title')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t('commitDetails.aiBatch.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div
            data-testid="ai-batch-loading"
            className="flex flex-col items-center justify-center gap-2 py-10 text-xs text-muted-foreground"
          >
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            {t('commitDetails.aiBatch.analyzing')}
          </div>
        ) : error ? (
          <div className="space-y-3 py-6">
            <p data-testid="ai-batch-error" className="text-center text-xs text-destructive">
              {error}
            </p>
            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={regenerate}>
                <RefreshCw className="h-3 w-3" />
                {t('commitDetails.aiBatch.regenerate')}
              </Button>
            </div>
          </div>
        ) : (
          <ScrollArea className="-mr-3 max-h-[52vh] pr-3">
            <div className="space-y-3">
              {proposals.map((proposal, index) => (
                <div
                  key={index}
                  data-testid={`ai-batch-proposal-${index}`}
                  className={cn(
                    'space-y-2 rounded-lg border p-3 transition-colors',
                    proposal.accepted ? 'border-primary/40 bg-muted/10' : 'border-border/40 opacity-60'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      data-testid={`ai-batch-accept-${index}`}
                      checked={proposal.accepted}
                      onChange={() => toggleAccepted(index)}
                    />
                    <span className="text-xs font-bold text-primary">
                      {t('commitDetails.aiBatch.commitLabel', { index: index + 1 })}
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

                  {proposal.accepted && !validations[index]?.valid && (
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
                  )}

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

        <DialogFooter className="gap-2">
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
          <Button variant="ghost" size="sm" className="text-xs" onClick={close} disabled={isApplying}>
            {t('commitDetails.aiBatch.cancel')}
          </Button>
          <Button
            size="sm"
            data-testid="ai-batch-apply"
            className="gap-1 text-xs"
            onClick={applyAccepted}
            disabled={!canApply || isApplying || isGenerating}
          >
            {isApplying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            {t('commitDetails.aiBatch.apply', { count: acceptedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
