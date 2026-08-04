import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Progress } from '@git-manager/ui'
import { ListChecks } from 'lucide-react'
import { dodProgress } from '../cardMeta'
import { DodChecklistEditor } from './DodChecklistEditor'

interface CardDodSectionProps {
  dod: string
  onSave: (dod: string) => Promise<unknown>
  readOnly?: boolean
}

/**
 * The card's Definition of Done: the checklist it is, with its progress.
 *
 * The rows themselves live in `DodChecklistEditor`, shared with the board's template. What this adds
 * is the progress read-out — and the optimistic copy that keeps a ticked box ticked while the write
 * is in flight, instead of springing back.
 *
 * Progress is informative: nothing here blocks moving an unfinished card into a done column.
 */
export function CardDodSection({ dod, onSave, readOnly }: CardDodSectionProps) {
  const { t } = useTranslation('board')
  const [optimistic, setOptimistic] = useState<string | null>(null)

  const shown = optimistic ?? dod
  const progress = dodProgress(shown)

  function commit(next: string) {
    setOptimistic(next)
    void Promise.resolve(onSave(next)).finally(() => setOptimistic(null))
  }

  return (
    <section data-testid="card-dod-section" className="border-b border-border px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3 w-3" />
          {t('card.dod.label')}
        </span>
        {progress.total > 0 && (
          <span
            data-testid="card-dod-progress"
            className="text-[11px] font-semibold text-foreground"
          >
            {t('card.dod.progress', { done: progress.done, total: progress.total })}
          </span>
        )}
      </div>

      {progress.total > 0 && (
        <Progress value={progress.percent} className="mb-2 h-1" data-testid="card-dod-bar" />
      )}

      {progress.total === 0 && (
        <p className="mb-2 text-xs italic text-muted-foreground" data-testid="card-dod-empty">
          {t('card.dod.empty')}
        </p>
      )}

      <DodChecklistEditor value={shown} onChange={commit} disabled={readOnly} />
    </section>
  )
}
