import { useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  Textarea,
} from '@git-manager/ui'
import { AlertTriangle, Sparkles } from 'lucide-react'
import type { GitGraphNode } from '@git-manager/git-types'
import { useCommitRecompose } from '../../../hooks/useCommitRecompose'

interface RecomposeDialogProps {
  repoPath: string
  nodes: GitGraphNode[]
  /** The right-clicked commit. Its message is rewritten, and it anchors the descendant range. */
  targetOid: string
  /** True for the "and its descendants" entry: every commit after the target is rewritten too. */
  includeChildren: boolean
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

/**
 * Reviewing AI-written commit messages before they are written into history.
 *
 * A review screen rather than a one-click action, because this is the only AI feature whose output
 * is **irreversible in place**: every other one produces text you can ignore, and this one replaces
 * messages in the repository. So nothing is applied until each proposal has been seen, and each can
 * be edited or declined individually.
 *
 * The warning is not decoration either. Rewording commit *n* gives a new SHA to every commit after
 * it, whether or not their messages changed — so a branch that was already pushed needs a
 * force-push afterwards. That consequence is invisible from the menu entry, which is why it is
 * stated here, above the button that causes it.
 */
export function RecomposeDialog({
  repoPath,
  nodes,
  targetOid,
  includeChildren,
  open,
  onClose,
  onSuccess,
}: RecomposeDialogProps) {
  const { t } = useTranslation('git')
  const recompose = useCommitRecompose(repoPath, nodes, onSuccess)
  const { generate, reset } = recompose

  // The commits whose messages are up for rewriting: the target alone, or the target plus every
  // commit that descends from it on the branch's first-parent line. `nodes` is newest-first, so the
  // slice up to the target is the descendant set and reversing yields the oldest-first order the
  // rebase needs.
  const targetIndex = nodes.findIndex((n) => n.commit.oid === targetOid)
  const selected =
    targetIndex === -1
      ? []
      : (includeChildren ? nodes.slice(0, targetIndex + 1) : [nodes[targetIndex]])
          .slice()
          .reverse()
          .map((n) => ({
            oid: n.commit.oid,
            shortOid: n.commit.shortOid,
            message: n.commit.message || n.commit.subject,
          }))

  // Commits that will be rewritten but whose messages nobody is editing — the "carried along" set.
  // Zero when the user picked the whole descendant range, since then everything is on screen.
  const carriedAlong = includeChildren ? 0 : targetIndex

  useEffect(() => {
    if (open && selected.length > 0) void generate(selected)
    if (!open) reset()
    // Re-running on every `selected` identity would loop: the array is rebuilt each render. The
    // dialog is opened against one target, which is what actually decides the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetOid, includeChildren])

  const isGenerating = recompose.status === 'generating'
  const isApplying = recompose.status === 'applying'

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isApplying && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="recompose-dialog">
        <DialogHeader>
          <DialogTitle>{t('recompose.title')}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground" data-testid="recompose-subtitle">
          {t('recompose.subtitle', { count: selected.length })}
        </p>

        <div className="flex items-start gap-1.5 rounded border border-destructive/50 bg-destructive/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
          <p className="text-[11px] text-destructive" data-testid="recompose-warning">
            {t('recompose.rewriteWarning')}
          </p>
        </div>

        {carriedAlong > 0 && (
          <p className="text-[11px] text-muted-foreground" data-testid="recompose-carried-along">
            {t('recompose.carriedAlong', { count: carriedAlong })}
          </p>
        )}

        {isGenerating && (
          <p
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            data-testid="recompose-progress"
          >
            <Spinner className="h-3 w-3" />
            {t('recompose.generating', {
              done: recompose.progress.done + 1,
              total: recompose.progress.total,
            })}
          </p>
        )}

        {recompose.error && (
          <p
            className="break-words rounded bg-destructive/20 px-3 py-2 text-xs text-destructive"
            data-testid="recompose-error"
          >
            {t('recompose.error')} — {recompose.error}
          </p>
        )}

        <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {recompose.proposals.map((proposal) => {
            const validation = recompose.validations[proposal.oid]
            return (
              <div
                key={proposal.oid}
                data-testid={`recompose-row-${proposal.shortOid}`}
                className="space-y-1.5 rounded-lg border border-border/40 bg-muted/10 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {proposal.shortOid}
                  </code>
                  <label className="flex cursor-pointer select-none items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground">
                    <Checkbox
                      data-testid={`recompose-keep-${proposal.shortOid}`}
                      checked={!proposal.accepted}
                      onChange={() => recompose.toggleAccepted(proposal.oid)}
                    />
                    <span>{t('recompose.keep')}</span>
                  </label>
                </div>

                <p className="truncate font-mono text-[10px] text-muted-foreground/70">
                  {t('recompose.previous')}: {proposal.previousMessage.split('\n')[0]}
                </p>

                <Textarea
                  data-testid={`recompose-message-${proposal.shortOid}`}
                  value={proposal.proposedMessage}
                  onChange={(e) => recompose.setMessage(proposal.oid, e.target.value)}
                  placeholder={t('recompose.proposed')}
                  rows={2}
                  className="resize-none font-mono text-[11px]"
                  disabled={proposal.accepted === false || isApplying}
                />

                {proposal.proposedMessage.trim() === '' && !isGenerating && (
                  <p className="text-[10px] text-muted-foreground">{t('recompose.empty')}</p>
                )}

                {proposal.accepted && validation && !validation.valid && (
                  <div
                    data-testid={`recompose-validation-${proposal.shortOid}`}
                    className="flex items-start gap-1.5 text-[10px] text-yellow-600 dark:text-yellow-400"
                  >
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <div className="space-y-0.5">
                      {validation.problems.map((p) => (
                        <p key={p.code}>{p.message}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {!isGenerating && recompose.acceptedCount === 0 && recompose.proposals.length > 0 && (
          <p className="text-[11px] text-muted-foreground" data-testid="recompose-nothing">
            {t('recompose.nothingSelected')}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isApplying}>
            {t('recompose.cancel')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="recompose-regenerate"
            onClick={() => void generate(selected)}
            disabled={isGenerating || isApplying || selected.length === 0}
          >
            <Sparkles className="mr-1 h-3 w-3 text-primary" />
            {t('recompose.regenerate')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            data-testid="recompose-apply"
            onClick={() => void recompose.apply()}
            disabled={!recompose.canApply || isApplying}
          >
            {isApplying && <Spinner className="mr-1 h-3 w-3" />}
            {isApplying
              ? t('recompose.applying')
              : t('recompose.apply', { count: recompose.acceptedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
