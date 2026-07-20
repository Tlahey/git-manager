import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { Eye } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { TimelineScrubber } from '@git-manager/components'
import { toast } from '@git-manager/ui'
import { useTimelineNavStore } from '../../stores/timelineNav.store'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'
import { deriveTimeline, type TimelineStep } from '../../lib/timelineModel'
import { formatRelativeTime, formatExactDate } from '../../lib/relativeDate'
import { TimelineStepsPanel } from './TimelineStepsPanel'

interface TimelineBarProps {
  repoPath: string
}

/**
 * The undo/redo timeline overlay: a bottom scrubber + a right-hand steps panel that let the user
 * navigate the history and *preview* each state read-only (by selecting the step's HEAD commit in
 * the graph) without mutating anything. The single real mutation happens on "validate", which walks
 * the undo store's pointer to the previewed step by replaying `undo`/`redo`. Cancel just closes.
 */
export function TimelineBar({ repoPath }: TimelineBarProps) {
  const { t, i18n } = useTranslation('git')
  const queryClient = useQueryClient()

  const isOpen = useTimelineNavStore((s) => s.isOpen)
  const navRepoPath = useTimelineNavStore((s) => s.repoPath)
  const previewIndex = useTimelineNavStore((s) => s.previewIndex)
  const setPreviewIndex = useTimelineNavStore((s) => s.setPreviewIndex)
  const close = useTimelineNavStore((s) => s.close)

  const history = useUndoHistoryStore((s) => s.byRepo[repoPath])
  const setPreviewHeadOid = useTimelineNavStore((s) => s.setPreviewHeadOid)

  const [applying, setApplying] = useState(false)

  const model = useMemo(
    () => deriveTimeline(history?.stack ?? [], history?.pointer ?? 0),
    [history?.stack, history?.pointer]
  )

  const active = isOpen && navRepoPath === repoPath
  const clampedPreview = Math.min(Math.max(previewIndex, 0), model.steps.length - 1)
  const previewStep = model.steps[clampedPreview]

  // Read-only preview: publish the previewed step's HEAD OID so the graph renders that commit's
  // changes at the center. No git mutation and no change to the graph's own selection — decoupled
  // so scrubbing can't move the real selection or scroll the list.
  useEffect(() => {
    if (!active) return
    setPreviewHeadOid(previewStep?.headOid ?? null)
  }, [active, previewStep?.headOid, setPreviewHeadOid])

  if (!active) return null

  const renderLabel = (step: TimelineStep) =>
    step.label ? t(step.label.key, step.label.params) : t('timeline.base')

  // Undo timestamps are epoch ms; the relativeDate helpers expect epoch seconds.
  const locale = i18n?.language
  const renderTimestamp = (step: TimelineStep) =>
    step.timestamp != null ? formatRelativeTime(step.timestamp / 1000, locale) : null
  const renderExactDate = (step: TimelineStep) =>
    step.timestamp != null ? formatExactDate(step.timestamp / 1000, locale) : null

  const delta = clampedPreview - model.currentIndex
  const hint =
    delta === 0
      ? t('timeline.hintCurrent')
      : delta < 0
        ? t('timeline.hintUndo', { count: -delta })
        : t('timeline.hintRedo', { count: delta })

  function invalidateRepo() {
    queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    mutate(['git-stashes', repoPath])
  }

  async function handleValidate() {
    if (applying || delta === 0) return
    setApplying(true)
    const store = useUndoHistoryStore.getState()
    try {
      if (delta < 0) {
        for (let i = 0; i < -delta; i++) await store.undo(repoPath)
      } else {
        for (let i = 0; i < delta; i++) await store.redo(repoPath)
      }
      invalidateRepo()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setApplying(false)
      close()
    }
  }

  function handleCancel() {
    // Nothing to restore — preview never touched the real graph selection or repo state.
    close()
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-overlay">
      <div className="pointer-events-auto absolute bottom-3 right-3 top-3 flex w-60 flex-col rounded-2xl border border-border bg-card/95 p-3 shadow-[0_20px_52px_-10px_rgba(0,0,0,0.55)] backdrop-blur">
        <TimelineStepsPanel
          steps={model.steps}
          previewIndex={clampedPreview}
          currentIndex={model.currentIndex}
          onSelect={setPreviewIndex}
          renderLabel={renderLabel}
          renderTimestamp={renderTimestamp}
          renderExactDate={renderExactDate}
          title={t('timeline.title')}
          currentTag={t('timeline.actual')}
        />
      </div>

      <div className="pointer-events-auto absolute inset-x-0 bottom-4 mx-auto flex w-[min(680px,calc(100%-17rem))] flex-col gap-2 pl-3">
        <div className="flex items-center gap-1.5 self-center rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-primary">
          <Eye className="h-3 w-3" />
          {t('timeline.previewBadge')}
        </div>
        <TimelineScrubber
          testId="timeline-scrubber"
          stepCount={model.steps.length}
          previewIndex={clampedPreview}
          onPreviewChange={setPreviewIndex}
          onValidate={handleValidate}
          onCancel={handleCancel}
          validateLabel={t('timeline.validate')}
          cancelLabel={t('timeline.cancel')}
          prevLabel={t('timeline.prev')}
          nextLabel={t('timeline.next')}
          trackLabel={t('timeline.track')}
          validateDisabled={applying || delta === 0}
          hint={hint}
        />
      </div>
    </div>
  )
}
