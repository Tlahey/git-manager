import { useCallback, useRef, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, cn } from '@git-manager/ui'

export interface TimelineScrubberProps {
  /** Total number of steps on the timeline (must be ≥ 1). */
  stepCount: number
  /** Index (0-based) the selector currently sits on. Clamped to `[0, stepCount - 1]`. */
  previewIndex: number
  /** Called with the newly picked index when the user drags/clicks the track or uses the arrows. */
  onPreviewChange: (index: number) => void
  onValidate: () => void
  onCancel: () => void
  validateLabel: string
  cancelLabel: string
  /** ARIA label for the round "previous step" button. */
  prevLabel: string
  /** ARIA label for the round "next step" button. */
  nextLabel: string
  /** ARIA label for the scrub track (role=slider). */
  trackLabel: string
  /** Disable the validate button (e.g. already on the current position — nothing to apply). */
  validateDisabled?: boolean
  /** Small helper line under the buttons — e.g. "Validate = undo ×2". */
  hint?: ReactNode
  testId?: string
}

function RoundButton({
  onClick,
  disabled,
  label,
  children,
  testId,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  children: ReactNode
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-[0_10px_24px_-4px_rgba(0,0,0,0.5)] transition-transform',
        'hover:enabled:scale-105 active:enabled:scale-95',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none'
      )}
    >
      {children}
    </button>
  )
}

/**
 * A purely-presentational timeline scrubber: a rounded "pill" track with a single vertical
 * selector that slides between `stepCount` evenly-spaced positions, flanked by two round
 * previous/next buttons (auto-disabled at the ends), with validate / cancel controls below.
 *
 * Domain-agnostic on purpose — it knows nothing about git, undo history or i18n. The caller owns
 * what each step means, the labels, and what "validate" does. Navigation is snap-to-step: dragging
 * or clicking the track rounds to the nearest index.
 */
export function TimelineScrubber({
  stepCount,
  previewIndex,
  onPreviewChange,
  onValidate,
  onCancel,
  validateLabel,
  cancelLabel,
  prevLabel,
  nextLabel,
  trackLabel,
  validateDisabled,
  hint,
  testId,
}: TimelineScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const maxIndex = Math.max(0, stepCount - 1)
  const index = Math.min(Math.max(previewIndex, 0), maxIndex)
  const ratio = maxIndex === 0 ? 0 : index / maxIndex

  const pickFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el || maxIndex === 0) return
      const rect = el.getBoundingClientRect()
      const r = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
      const next = Math.round(r * maxIndex)
      if (next !== index) onPreviewChange(next)
    },
    [index, maxIndex, onPreviewChange]
  )

  const atStart = index <= 0
  const atEnd = index >= maxIndex

  return (
    <div className="flex flex-col items-center gap-4" data-testid={testId}>
      <div className="flex w-full items-center gap-4">
        <RoundButton
          onClick={() => !atStart && onPreviewChange(index - 1)}
          disabled={atStart}
          label={prevLabel}
          testId={testId ? `${testId}-prev` : undefined}
        >
          <ChevronLeft className="h-5 w-5" />
        </RoundButton>

        <div className="min-w-0 flex-1 rounded-full border border-border bg-card px-8 py-5 shadow-[0_20px_48px_-10px_rgba(0,0,0,0.55)]">
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label={trackLabel}
            aria-valuemin={0}
            aria-valuemax={maxIndex}
            aria-valuenow={index}
            data-testid={testId ? `${testId}-track` : undefined}
            onPointerDown={(e) => {
              draggingRef.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              pickFromClientX(e.clientX)
            }}
            onPointerMove={(e) => {
              if (draggingRef.current) pickFromClientX(e.clientX)
            }}
            onPointerUp={() => {
              draggingRef.current = false
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' && !atStart) {
                e.preventDefault()
                onPreviewChange(index - 1)
              } else if (e.key === 'ArrowRight' && !atEnd) {
                e.preventDefault()
                onPreviewChange(index + 1)
              }
            }}
            className="relative h-6 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <div className="absolute inset-x-1 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
            <div
              className="absolute left-1 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
              style={{ width: `calc((100% - 0.5rem) * ${ratio})` }}
            />
            <div
              className="absolute top-1/2 h-6 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_4px_12px_-1px_rgba(0,0,0,0.55)] transition-[left]"
              style={{ left: `calc(0.25rem + (100% - 0.5rem) * ${ratio})` }}
            />
          </div>
        </div>

        <RoundButton
          onClick={() => !atEnd && onPreviewChange(index + 1)}
          disabled={atEnd}
          label={nextLabel}
          testId={testId ? `${testId}-next` : undefined}
        >
          <ChevronRight className="h-5 w-5" />
        </RoundButton>
      </div>

      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-2 shadow-[0_14px_36px_-8px_rgba(0,0,0,0.5)]">
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            data-testid={testId ? `${testId}-cancel` : undefined}
            className="min-w-[108px] rounded-full"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onValidate}
            disabled={validateDisabled}
            data-testid={testId ? `${testId}-validate` : undefined}
            className="min-w-[108px] rounded-full"
          >
            {validateLabel}
          </Button>
        </div>
        {hint && <p className="min-h-4 px-1 text-center text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}
