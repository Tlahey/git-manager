import type { ReactNode } from 'react'
import { Check, GripVertical } from 'lucide-react'
import { Badge, cn, type BadgeProps } from '@git-manager/ui'

export const STEP_RAIL_ROW_HEIGHT = 44

export type StepRailVariant = 'normal' | 'combined' | 'dropped'

/**
 * How far along a step is, for a rail that reports progress rather than an editable plan:
 * `done` marks the dot with a check, `current` rings it in the accent color, `pending` leaves
 * it hollow and dashes the connector below it. Omit it for the plain plan-editor look.
 */
export type StepRailProgress = 'done' | 'current' | 'pending'

interface StepRailRowProps {
  index: number
  isLast: boolean
  isSelected: boolean
  /** `combined` draws a dashed curve folding into the row above (e.g. a squash/fixup step);
   * `dropped` draws an outline dot and strikes the title through. */
  variant?: StepRailVariant
  /** See {@link StepRailProgress} — read-only progress marker, independent of `variant`. */
  progress?: StepRailProgress
  title: ReactNode
  subtitle?: ReactNode
  badgeLabel: string
  badgeVariant?: BadgeProps['variant']
  trailingCaption?: ReactNode
  /** Drag-to-reorder affordances (grip handle + drag handlers). Default `true`. */
  draggable?: boolean
  onRowClick?: (index: number, e: React.MouseEvent) => void
  onDragStart?: (index: number) => void
  onDragOverRow?: (index: number) => void
  onDrop?: () => void
  testId?: string
}

/**
 * One row of a step list, with a mini connector rail (a vertical line through every row,
 * folding into a dashed curve for `combined` rows) — built for interactive-rebase-style plan
 * editors, and reused read-only (`draggable={false}` + `progress`) to report how far a running
 * rebase has got. Purely presentational: selection, drag state and what each row means are
 * owned by the caller.
 */
export function StepRailRow({
  index,
  isLast,
  isSelected,
  variant = 'normal',
  progress,
  title,
  subtitle,
  badgeLabel,
  badgeVariant,
  trailingCaption,
  draggable = true,
  onRowClick,
  onDragStart,
  onDragOverRow,
  onDrop,
  testId,
}: StepRailRowProps) {
  const isCombined = variant === 'combined'
  const isDropped = variant === 'dropped'
  const isPending = progress === 'pending'
  const isCurrent = progress === 'current'

  return (
    <div
      draggable={draggable}
      data-testid={testId}
      data-progress={progress}
      onClick={onRowClick ? (e) => onRowClick(index, e) : undefined}
      onDragStart={draggable && onDragStart ? () => onDragStart(index) : undefined}
      onDragOver={
        draggable && onDragOverRow
          ? (e) => {
              e.preventDefault()
              onDragOverRow(index)
            }
          : undefined
      }
      onDrop={
        draggable && onDrop
          ? (e) => {
              e.preventDefault()
              onDrop()
            }
          : undefined
      }
      className={cn(
        'border-border/30 flex w-full items-center gap-1 border-b pr-3 text-xs transition-colors',
        onRowClick && 'cursor-pointer',
        // Selection wins over the `current` tint — otherwise the step in progress, which is
        // exactly the row most likely to be selected, would never look selected.
        isSelected
          ? 'bg-accent'
          : isCurrent
            ? 'bg-primary/10'
            : onRowClick && 'hover:bg-accent/40'
      )}
      style={{ height: STEP_RAIL_ROW_HEIGHT }}
    >
      {draggable ? (
        <GripVertical className="text-muted-foreground/40 ml-1 h-3.5 w-3.5 shrink-0 cursor-grab" />
      ) : (
        <span className="ml-1 h-3.5 w-3.5 shrink-0" />
      )}

      {/* Mini graph rail */}
      <svg width={28} height={STEP_RAIL_ROW_HEIGHT} className="shrink-0">
        {index > 0 && (
          <line
            x1={10}
            y1={0}
            x2={10}
            y2={STEP_RAIL_ROW_HEIGHT / 2}
            className="stroke-border"
            strokeWidth={1.5}
          />
        )}
        {!isLast && (
          <line
            x1={10}
            y1={STEP_RAIL_ROW_HEIGHT / 2}
            x2={10}
            y2={STEP_RAIL_ROW_HEIGHT}
            className="stroke-border"
            strokeWidth={1.5}
            // Everything below the step in progress is still hypothetical.
            strokeDasharray={isCurrent || isPending ? '3 3' : undefined}
          />
        )}
        {isCombined ? (
          <>
            {/* Curve folding into the row above */}
            <path
              d={`M 20 ${STEP_RAIL_ROW_HEIGHT / 2} C 20 ${STEP_RAIL_ROW_HEIGHT / 4}, 10 ${STEP_RAIL_ROW_HEIGHT / 4}, 10 0`}
              fill="none"
              className="stroke-primary"
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
            <circle cx={20} cy={STEP_RAIL_ROW_HEIGHT / 2} r={3} className="fill-primary" />
          </>
        ) : (
          <>
            {/* A halo ring makes the step the rebase is stopped on findable at a glance. */}
            {isCurrent && (
              <circle
                cx={10}
                cy={STEP_RAIL_ROW_HEIGHT / 2}
                r={7}
                className="fill-primary/25 stroke-primary"
                strokeWidth={1.5}
              />
            )}
            <circle
              cx={10}
              cy={STEP_RAIL_ROW_HEIGHT / 2}
              r={isDropped || isPending ? 3.5 : 4}
              className={cn(
                isDropped || isPending
                  ? 'stroke-muted-foreground/50 fill-transparent'
                  : 'fill-primary stroke-none'
              )}
              strokeWidth={1.5}
            />
          </>
        )}
      </svg>

      {progress === 'done' && (
        <Check className="text-primary mr-0.5 -ml-1 h-3 w-3 shrink-0" aria-hidden />
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span
          className={cn(
            'truncate leading-tight font-medium',
            isDropped ? 'text-muted-foreground/50 line-through' : 'text-foreground',
            (isCombined || isPending) && 'text-muted-foreground',
            isCurrent && 'text-foreground font-semibold'
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span className="text-muted-foreground/70 truncate text-[10px] leading-tight">
            {subtitle}
          </span>
        )}
      </div>

      <Badge
        variant={badgeVariant ?? 'secondary'}
        className="shrink-0 px-1.5 py-0 text-[9px] uppercase select-none"
      >
        {badgeLabel}
      </Badge>
      {trailingCaption && (
        <span className="text-muted-foreground/70 shrink-0 font-mono text-[10px]">
          {trailingCaption}
        </span>
      )}
    </div>
  )
}
