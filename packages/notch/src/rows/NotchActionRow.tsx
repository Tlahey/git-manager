import { Badge, Button } from '@git-manager/ui'
import { NOTCH_ROW, withRule } from '../notchGeometry'
import type { NotchAction } from '../types'

export interface NotchActionRowProps {
  actions: NotchAction[]
  /** Right-aligned badge (`#231`, `3 files`). */
  badge?: string
  /** Receives the {@link NotchAction.id} of whichever button was pressed. */
  onAction: (actionId: string) => void
}

/**
 * Row 3: what you can do about it.
 *
 * Each button stops propagation — the card itself is clickable, and a button that also triggered
 * the card's own activation would fire two different actions from one press.
 */
export function NotchActionRow({ actions, badge, onAction }: NotchActionRowProps) {
  return (
    <div
      data-testid="notch-action-row"
      style={{ height: withRule(NOTCH_ROW.actions) }}
      className="flex shrink-0 items-center justify-between gap-2 border-t border-white/5 px-3"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {actions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            data-testid={`notch-action-${action.id}`}
            {...(action.variant === 'primary' ? {} : { variant: 'ghost' as const })}
            onClick={(e) => {
              e.stopPropagation()
              onAction(action.id)
            }}
            className={
              action.variant === 'primary'
                ? 'h-7 truncate px-2.5 text-[11px]'
                : 'h-7 truncate px-2.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white'
            }
          >
            {action.label}
          </Button>
        ))}
      </div>
      {badge !== undefined && (
        <Badge
          data-testid="notch-badge"
          variant="outline"
          className="shrink-0 border-white/15 px-2 py-0 text-[10px] font-bold tabular-nums text-white/70"
        >
          {badge}
        </Badge>
      )}
    </div>
  )
}
