import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Progress } from '@git-manager/ui'
import { dodProgress } from '../lib/cardMeta'
import { DodChecklistEditor } from './DodChecklistEditor'
import { CardContentSection } from './CardContentSection'

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
    <CardContentSection
      title={t('card.dod.label')}
      sectionKey="card-dod"
      testId="card-dod-section"
      aside={
        progress.total > 0 ? (
          <span
            data-testid="card-dod-progress"
            className="text-[11px] font-semibold text-foreground"
          >
            {t('card.dod.progress', { done: progress.done, total: progress.total })}
          </span>
        ) : undefined
      }
    >
      {progress.total > 0 && (
        <Progress value={progress.percent} className="mb-2 h-1" data-testid="card-dod-bar" />
      )}

      {progress.total === 0 && (
        <p className="mb-2 text-xs text-muted-foreground italic" data-testid="card-dod-empty">
          {t('card.dod.empty')}
        </p>
      )}

      <DodChecklistEditor value={shown} onChange={commit} disabled={readOnly} />
    </CardContentSection>
  )
}
