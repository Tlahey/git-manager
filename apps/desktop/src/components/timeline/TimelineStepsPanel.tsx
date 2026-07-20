import type { ComponentType } from 'react'
import {
  Flag,
  GitCommitHorizontal,
  Undo2,
  FileX,
  GitBranch,
  Tag,
  Cloud,
  Archive,
  ArchiveRestore,
  GitMerge,
  History,
} from 'lucide-react'
import { cn } from '@git-manager/ui'
import type { TimelineStep, TimelineStepType } from '../../lib/timelineModel'

const STEP_ICONS: Record<TimelineStepType, ComponentType<{ className?: string }>> = {
  base: Flag,
  commit: GitCommitHorizontal,
  reset: Undo2,
  revert: Undo2,
  discard: FileX,
  checkout: GitBranch,
  createBranch: GitBranch,
  deleteBranch: GitBranch,
  createTag: Tag,
  removeRemote: Cloud,
  stashPush: Archive,
  stashPop: ArchiveRestore,
  stashApply: ArchiveRestore,
  stashDrop: Archive,
  fixup: GitMerge,
  autosquash: GitMerge,
  interactiveRebase: GitMerge,
}

interface TimelineStepsPanelProps {
  steps: TimelineStep[]
  previewIndex: number
  currentIndex: number
  onSelect: (index: number) => void
  /** Resolves a step to a display string (i18n label for actions, a fallback for the base step). */
  renderLabel: (step: TimelineStep) => string
  /** Relative date to show under the label (e.g. "5m ago"), or `null` to omit (e.g. the base step). */
  renderTimestamp?: (step: TimelineStep) => string | null
  /** Absolute date for the row's title tooltip, or `null` to omit. */
  renderExactDate?: (step: TimelineStep) => string | null
  title: string
  currentTag: string
}

/**
 * Right-hand panel listing every timeline step. The previewed step is highlighted, the real
 * pointer position is tagged "actual", and steps ahead of it (the redo tail) are dimmed. Purely
 * presentational — selection and labelling are owned by the caller.
 */
export function TimelineStepsPanel({
  steps,
  previewIndex,
  currentIndex,
  onSelect,
  renderLabel,
  renderTimestamp,
  renderExactDate,
  title,
  currentTag,
}: TimelineStepsPanelProps) {
  return (
    <div className="flex h-full w-full flex-col" data-testid="timeline-steps-panel">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <History className="h-4 w-4" />
        {title}
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[step.type] ?? Flag
          const active = step.index === previewIndex
          const ahead = step.index > currentIndex
          const timestamp = renderTimestamp?.(step) ?? null
          const exactDate = renderExactDate?.(step) ?? null
          // Rail fill mirrors the scrubber: a node/segment is "reached" once the preview selector
          // has passed it. `reached` = up to and including this step; `passed` = strictly beyond it.
          const reached = step.index <= previewIndex
          const passed = step.index < previewIndex
          const isFirst = i === 0
          const isLast = i === steps.length - 1
          return (
            <button
              type="button"
              key={step.index}
              onClick={() => onSelect(step.index)}
              data-testid={`timeline-step-${step.index}`}
              aria-current={active}
              title={exactDate ?? undefined}
              className={cn(
                'flex items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                active ? 'bg-accent' : 'hover:bg-accent/40',
                ahead && 'opacity-45'
              )}
            >
              {/* Vertical timeline rail: a filled track + node up to the previewed step. */}
              <div className="relative w-3.5 shrink-0 self-stretch" aria-hidden="true">
                {!isFirst && (
                  <div
                    className={cn(
                      'absolute left-1/2 top-0 h-[15px] w-0.5 -translate-x-1/2 transition-colors',
                      reached ? 'bg-primary' : 'bg-border'
                    )}
                  />
                )}
                {!isLast && (
                  // Extend past the row's bottom padding + the list `gap-1` (6 + 4 + 6 = 16px) so the
                  // segment reaches the next node instead of stopping at this row's content box.
                  <div
                    className={cn(
                      'absolute -bottom-4 left-1/2 top-[15px] w-0.5 -translate-x-1/2 transition-colors',
                      passed ? 'bg-primary' : 'bg-border'
                    )}
                  />
                )}
                <div
                  data-testid={`timeline-node-${step.index}`}
                  data-state={active ? 'active' : reached ? 'reached' : 'unreached'}
                  className={cn(
                    'absolute left-1/2 top-[15px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all',
                    active
                      ? 'h-2.5 w-2.5 bg-primary ring-2 ring-primary/25'
                      : reached
                        ? 'h-2 w-2 bg-primary'
                        : 'h-2 w-2 border border-border bg-card'
                  )}
                />
              </div>
              <Icon
                className={cn(
                  'mt-0.5 h-[15px] w-[15px] shrink-0',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      active ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {renderLabel(step)}
                  </span>
                  {step.index === currentIndex && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">{currentTag}</span>
                  )}
                </div>
                {timestamp && (
                  <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
                    {timestamp}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
