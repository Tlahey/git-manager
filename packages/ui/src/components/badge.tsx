import * as React from 'react'
import { cn } from '../lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantClasses = {
    // Rides the --badge-* component token (defaults to --primary) so a theme can
    // give the chip an accessible, visible fill — see packages/config/tailwind.js.
    default: 'bg-badge text-badge-foreground',
    // Secondary/destructive ride their own --badge-* component tokens (defaulting
    // to --secondary/--destructive) so a theme can fix the chip's APCA/AA contrast
    // without moving the semantic color (--secondary is also a surface and
    // --destructive a raw icon color in toast.tsx).
    secondary: 'bg-badge-secondary text-badge-secondary-foreground',
    destructive: 'bg-badge-destructive text-badge-destructive-foreground',
    outline: 'border border-input text-foreground',
    // Soft tone chips: translucent /15 tint + text on the --tone-*-foreground
    // tokens, so the label adapts per surface and stays AA (the raw text-success /
    // text-amber-600 washed out on light content like Twilight). Border is decorative.
    success: 'bg-success/15 text-tone-success border border-success/25',
    warning: 'bg-amber-500/15 text-tone-warning border border-amber-500/25',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

export interface NumberBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The value to display; the badge is hidden when this is 0 or less (unless `hideZero` is false). */
  count: number
  hideZero?: boolean
  /** Values above this render as `${max}+` so the pill can't grow unbounded. */
  max?: number
}

/**
 * A compact circular count pill (e.g. unread notifications). Rides the `--badge`
 * component token (fill + foreground) rather than raw `--primary`, so (a) its label
 * stays WCAG AA on every theme and (b) its *fill* is graded against the surface by
 * evaluateGraphicalContrast (WCAG 1.4.11) — a theme can re-point --badge-bg to a
 * shade that pops off the page, like Twilight's deeper violet. Callers add
 * positioning (absolute overlay) via `className`.
 */
function NumberBadge({ count, hideZero = true, max = 99, className, ...props }: NumberBadgeProps) {
  if (hideZero && count <= 0) return null
  return (
    <span
      className={cn(
        'inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-badge px-1 text-[10px] font-bold leading-none tabular-nums text-badge-foreground',
        className
      )}
      {...props}
    >
      {count > max ? `${max}+` : count}
    </span>
  )
}

export { Badge, NumberBadge }
