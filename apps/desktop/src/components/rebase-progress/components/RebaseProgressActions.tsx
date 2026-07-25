import { Button, Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { RebaseControl } from '../../../hooks/useRebaseControls'

interface RebaseProgressActionsProps {
  /** A rebase only takes these while it's stopped; mid-apply there's nothing to answer. */
  paused: boolean
  /** No conflict markers left in the index — `git rebase --continue` will go through. */
  allResolved: boolean
  /** Nothing staged at all, so skipping the step is the sensible way past it. */
  canSkip: boolean
  pending: RebaseControl | null
  error: string | null
  onContinue: () => void
  onSkip: () => void
  onAbort: () => void
}

/**
 * Footer of the rebase progress view: the same continue / skip / abort choices the conflict
 * panel offers (both drive `useRebaseControls`), kept here because this view stays put while the
 * right-hand panel switches to whatever commit the user inspects.
 */
export function RebaseProgressActions({
  paused,
  allResolved,
  canSkip,
  pending,
  error,
  onContinue,
  onSkip,
  onAbort,
}: RebaseProgressActionsProps) {
  const { t } = useTranslation('git')

  return (
    <div
      className="flex shrink-0 flex-col gap-1.5 border-t border-border bg-card px-4 py-2.5"
      data-testid="rebase-progress-actions"
    >
      {error && (
        <p className="truncate text-xs text-destructive" data-testid="rebase-progress-error">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        {paused && allResolved && (
          <Button
            variant="success"
            size="sm"
            className="h-7 text-[11px] font-semibold"
            onClick={onContinue}
            disabled={!!pending}
            data-testid="rebase-progress-continue"
          >
            {pending === 'continue' && <Spinner className="mr-1 h-3 w-3" />}
            {t('conflictEditor.continueRebase')}
          </Button>
        )}
        {paused && canSkip && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] font-semibold"
            onClick={onSkip}
            disabled={!!pending}
            data-testid="rebase-progress-skip"
          >
            {pending === 'skip' && <Spinner className="mr-1 h-3 w-3" />}
            {t('conflictEditor.skipCommit')}
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          className="ml-auto h-7 text-[11px] font-semibold"
          onClick={onAbort}
          disabled={!!pending}
          data-testid="rebase-progress-abort"
        >
          {pending === 'abort' && <Spinner className="mr-1 h-3 w-3" />}
          {t('conflictEditor.abortRebase')}
        </Button>
      </div>
    </div>
  )
}
