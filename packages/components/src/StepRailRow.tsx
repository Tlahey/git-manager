import type { ReactNode } from 'react'
import { GripVertical } from 'lucide-react'
import { Badge, cn, type BadgeProps } from '@git-manager/ui'

export const STEP_RAIL_ROW_HEIGHT = 44

export type StepRailVariant = 'normal' | 'combined' | 'dropped'

interface StepRailRowProps {
  index: number
  isLast: boolean
  isSelected: boolean
  /** `combined` draws a dashed curve folding into the row above (e.g. a squash/fixup step);
   * `dropped` draws an outline dot and strikes the title through. */
  variant?: StepRailVariant
  title: ReactNode
  subtitle?: ReactNode
  badgeLabel: string
  badgeVariant?: BadgeProps['variant']
  trailingCaption?: ReactNode
  onRowClick: (index: number, e: React.MouseEvent) => void
  onDragStart: (index: number) => void
  onDragOverRow: (index: number) => void
  onDrop: () => void
  testId?: string
}

/**
 * One row of a reorderable, draggable step list, with a mini connector rail
 * (a vertical line through every row, folding into a dashed curve for
 * `combined` rows) — built for interactive-rebase-style plan editors. Purely
 * presentational: selection, drag state and what each row means are owned by
 * the caller.
 */
export function StepRailRow({
  index,
  isLast,
  isSelected,
  variant = 'normal',
  title,
  subtitle,
  badgeLabel,
  badgeVariant,
  trailingCaption,
  onRowClick,
  onDragStart,
  onDragOverRow,
  onDrop,
  testId,
}: StepRailRowProps) {
  const isCombined = variant === 'combined'
  const isDropped = variant === 'dropped'

  return (
    <div
      draggable
      data-testid={testId}
      onClick={(e) => onRowClick(index, e)}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOverRow(index)
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      className={cn(
        'border-border/30 flex w-full cursor-pointer items-center gap-1 border-b pr-3 text-xs transition-colors',
        isSelected ? 'bg-accent' : 'hover:bg-accent/40'
      )}
      style={{ height: STEP_RAIL_ROW_HEIGHT }}
    >
      <GripVertical className="text-muted-foreground/40 ml-1 h-3.5 w-3.5 shrink-0 cursor-grab" />

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
          <circle
            cx={10}
            cy={STEP_RAIL_ROW_HEIGHT / 2}
            r={isDropped ? 3.5 : 4}
            className={cn(
              isDropped ? 'stroke-muted-foreground/50 fill-transparent' : 'fill-primary stroke-none'
            )}
            strokeWidth={1.5}
          />
        )}
      </svg>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span
          className={cn(
            'truncate leading-tight font-medium',
            isDropped ? 'text-muted-foreground/50 line-through' : 'text-foreground',
            isCombined && 'text-muted-foreground'
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
