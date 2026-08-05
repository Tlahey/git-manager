import { useTranslation } from '@git-manager/i18n'
import { Eye, Minus, Plus } from 'lucide-react'
import type { TimelineDelta } from '../../components/git-graph/timelineDelta'

/**
 * States, above the graph, what the previewed timeline step changes: how many commits it takes
 * away and how many it brings back.
 *
 * It sits in the graph rather than on the scrubber because that is where the eye is while
 * scrubbing, and because the scrubber's own hint counts *gestures* ("undo 2 steps") — which says
 * nothing about how much history moves. Renders nothing when the step changes no commit, so
 * landing back on the current position leaves the graph unadorned.
 */
export function TimelinePreviewBanner({ delta }: { delta: TimelineDelta }) {
  const { t } = useTranslation('git')
  if (delta.removed === 0 && delta.added === 0) return null

  return (
    <div
      data-testid="timeline-preview-banner"
      className="flex shrink-0 items-center gap-3 border-b border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary"
    >
      <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="font-medium">{t('timeline.previewBanner')}</span>
      {delta.removed > 0 && (
        <span className="flex items-center gap-1 text-tone-danger" data-testid="timeline-removed">
          <Minus className="h-3 w-3 shrink-0" aria-hidden />
          {t('timeline.previewRemoved', { count: delta.removed })}
        </span>
      )}
      {delta.added > 0 && (
        <span className="flex items-center gap-1 text-tone-success" data-testid="timeline-added">
          <Plus className="h-3 w-3 shrink-0" aria-hidden />
          {t('timeline.previewAdded', { count: delta.added })}
        </span>
      )}
    </div>
  )
}
