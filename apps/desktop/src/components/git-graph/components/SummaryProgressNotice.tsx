import type { SummaryProgress } from '@git-manager/ai'
import { useTranslation } from '@git-manager/i18n'
import { Progress } from '@git-manager/ui'

interface SummaryProgressNoticeProps {
  /** The run's map phase, or `null` when it is not running one. */
  progress: SummaryProgress | null
  /** Prefix for this panel's `data-testid`. */
  testIdPrefix: string
}

/**
 * How far the per-file reading has got, for a panel whose answer streams only once every file has
 * been described.
 *
 * It takes the place of the coverage line these panels used to show, and answers the opposite
 * question. Coverage said *how little* a single budgeted prompt had managed to read — a caveat about
 * the answer. There is no such prompt any more: every file is read whole, in its own call, so what
 * the reader needs is not a caveat but a reason for the wait. Minutes can pass before the first
 * token of a branch explanation arrives, and a stream that has not started is indistinguishable
 * from one that has hung.
 *
 * Silent once the map phase is done, so it does not sit under a finished explanation.
 */
export function SummaryProgressNotice({ progress, testIdPrefix }: SummaryProgressNoticeProps) {
  const { t } = useTranslation('git')
  if (progress?.phase !== 'summarizing') return null

  return (
    <div className="space-y-1" data-testid={`${testIdPrefix}-progress`}>
      <p className="text-[10px] text-muted-foreground">
        {t('gitTree.explanation.summarizing', {
          done: progress.completed,
          total: progress.total,
        })}
      </p>
      <Progress value={Math.round((progress.completed / Math.max(1, progress.total)) * 100)} />
    </div>
  )
}
