import { GripVertical } from 'lucide-react'
import { Badge, cn } from '@git-manager/ui'
import type { RebasePlanStep } from '../rebasePlan'

const ACTION_VARIANTS: Record<string, 'success' | 'destructive' | 'secondary' | 'warning'> = {
  pick: 'secondary',
  reword: 'warning',
  squash: 'success',
  fixup: 'success',
  drop: 'destructive',
}

export const REBASE_ROW_HEIGHT = 44

interface RebaseStepRowProps {
  step: RebasePlanStep
  index: number
  isLast: boolean
  isSelected: boolean
  actionLabel: string
  onRowClick: (index: number, e: React.MouseEvent) => void
  onDragStart: (index: number) => void
  onDragOverRow: (index: number) => void
  onDrop: () => void
}

/**
 * One row of the rebase plan: drag handle, mini graph rail (squash/fixup rows
 * draw a curve folding into the commit above), subject, action badge and sha.
 * Purely presentational — selection, drag state and plan mutations live in
 * `RebasingCommitWindow`.
 */
export function RebaseStepRow({
  step,
  index,
  isLast,
  isSelected,
  actionLabel,
  onRowClick,
  onDragStart,
  onDragOverRow,
  onDrop,
}: RebaseStepRowProps) {
  const isCombined = step.action === 'squash' || step.action === 'fixup'
  const isDropped = step.action === 'drop'
  const subject = step.action === 'reword' && step.message ? step.message.split('\n')[0] : step.commit.subject

  return (
    <div
      draggable
      data-testid={`rebase-step-${step.commit.shortOid}`}
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
        'flex w-full cursor-pointer items-center gap-1 border-b border-border/30 pr-3 text-xs transition-colors',
        isSelected ? 'bg-accent' : 'hover:bg-accent/40',
      )}
      style={{ height: REBASE_ROW_HEIGHT }}
    >
      <GripVertical className="ml-1 h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/40" />

      {/* Mini graph rail */}
      <svg width={28} height={REBASE_ROW_HEIGHT} className="shrink-0">
        {index > 0 && <line x1={10} y1={0} x2={10} y2={REBASE_ROW_HEIGHT / 2} className="stroke-border" strokeWidth={1.5} />}
        {!isLast && (
          <line x1={10} y1={REBASE_ROW_HEIGHT / 2} x2={10} y2={REBASE_ROW_HEIGHT} className="stroke-border" strokeWidth={1.5} />
        )}
        {isCombined ? (
          <>
            {/* Curve folding into the commit above */}
            <path
              d={`M 20 ${REBASE_ROW_HEIGHT / 2} C 20 ${REBASE_ROW_HEIGHT / 4}, 10 ${REBASE_ROW_HEIGHT / 4}, 10 0`}
              fill="none"
              className="stroke-primary"
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
            <circle cx={20} cy={REBASE_ROW_HEIGHT / 2} r={3} className="fill-primary" />
          </>
        ) : (
          <circle
            cx={10}
            cy={REBASE_ROW_HEIGHT / 2}
            r={isDropped ? 3.5 : 4}
            className={cn(
              isDropped ? 'fill-transparent stroke-muted-foreground/50' : 'fill-primary stroke-none',
            )}
            strokeWidth={1.5}
          />
        )}
      </svg>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span
          className={cn(
            'truncate font-medium leading-tight',
            isDropped ? 'text-muted-foreground/50 line-through' : 'text-foreground',
            isCombined && 'text-muted-foreground',
          )}
        >
          {subject}
        </span>
        <span className="truncate text-[10px] leading-tight text-muted-foreground/70">
          {step.commit.author.name} · {new Date(step.commit.author.timestamp * 1000).toLocaleDateString()}
        </span>
      </div>

      <Badge variant={ACTION_VARIANTS[step.action] ?? 'secondary'} className="shrink-0 px-1.5 py-0 text-[9px] uppercase select-none">
        {actionLabel}
      </Badge>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{step.commit.shortOid}</span>
    </div>
  )
}
