import { Check, Lock, Monitor } from 'lucide-react'
import { Tooltip } from '@git-manager/ui'

/**
 * One theme in the appearance picker: its swatch, its name, and — for a theme still locked behind
 * an achievement — the padlock and the hint that says how to earn it.
 *
 * A locked card is wrapped in a tooltip rather than disabled, because a disabled control says "not
 * for you" and this one has to say "not yet, and here is how".
 */
interface ThemeCardProps {
  id: string
  label: string
  colors: { bg: string; fg: string; primary: string; accent: string } | null
  isSystem?: boolean
  isActive: boolean
  isCustom?: boolean
  locked?: boolean
  lockedLabel?: string
  unlockHint?: string
  onClick: () => void
}

export function ThemeCard({
  id,
  label,
  colors,
  isSystem,
  isActive,
  isCustom,
  locked,
  lockedLabel,
  unlockHint,
  onClick,
}: ThemeCardProps) {
  const card = (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      data-testid={`theme-card-${id}`}
      className={`relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-all ${
        locked
          ? 'cursor-default border-border/60 opacity-60'
          : 'cursor-pointer border-border hover:border-muted-foreground/40 hover:bg-accent/50'
      } ${isActive && !locked ? 'border-primary bg-primary/10 ring-1 ring-primary' : ''}`}
    >
      {/* Swatch preview */}
      {isSystem ? (
        <div className="flex h-12 w-full items-center justify-center rounded-md border border-border bg-linear-to-br from-muted to-background">
          <Monitor className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : colors ? (
        <div
          className={`relative h-12 w-full overflow-hidden rounded-md border border-black/10 ${locked ? 'grayscale' : ''}`}
          style={{ background: colors.bg }}
        >
          <div className="flex h-full gap-0.5 p-1.5">
            <div className="flex-1 rounded-sm" style={{ background: colors.primary }} />
            <div className="flex-1 rounded-sm" style={{ background: colors.accent }} />
            <div className="flex-1 rounded-sm opacity-60" style={{ background: colors.fg }} />
          </div>
          {locked && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Lock className="h-4 w-4 text-white" />
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex h-12 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30">
          <span className="text-[10px] text-muted-foreground">CSS</span>
        </div>
      )}

      {/* Name + badges */}
      <div className="flex w-full items-center justify-between gap-1 overflow-hidden">
        <span className="flex items-center gap-1 truncate text-xs font-medium text-foreground">
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {isCustom && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
              custom
            </span>
          )}
          {locked && (
            <span
              data-testid={`theme-locked-badge-${id}`}
              className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
            >
              <Lock className="h-2.5 w-2.5" />
              {lockedLabel}
            </span>
          )}
          {isActive && !locked && <Check className="h-3.5 w-3.5 text-primary" />}
        </div>
      </div>
    </button>
  )

  if (!locked || !unlockHint) return card

  return <Tooltip content={unlockHint}>{card}</Tooltip>
}
