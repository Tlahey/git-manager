import * as React from 'react'
import { cn } from '../lib/utils'

// A progress bar (download %, contribution meters, a running background operation).
// Centralises the track/fill tokens the ad-hoc `rounded-full bg-muted` + `bg-primary` bars
// repeated, and — unlike those bare divs — exposes proper `role="progressbar"` + aria-value*
// so assistive tech announces the amount. `value` is a 0–100 percentage.
export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  /** Extra classes for the fill (e.g. a tone colour); defaults to bg-primary. */
  indicatorClassName?: string
  /**
   * No known total: renders a sliver travelling across the track instead of a fill, and drops
   * `aria-valuenow` (ARIA's own way of saying "in progress, amount unknown") rather than
   * announcing a made-up 0%.
   *
   * This is what an operation looks like before it can report a denominator — a clone before the
   * server announces its object count, a hook that just started — and pretending otherwise means
   * a bar that sits at 0 and looks stuck.
   */
  indeterminate?: boolean
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      value = 0,
      className,
      indicatorClassName,
      indeterminate = false,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      'aria-hidden': ariaHidden,
      ...props
    },
    ref
  ) => {
    const pct = Math.max(0, Math.min(100, value))
    // A role=progressbar needs an accessible name (axe: aria-progressbar-name). Prefer
    // the caller's label/labelledby; fall back to a generic one so it's never nameless,
    // unless the caller opted the bar out of the a11y tree (aria-hidden).
    const name = ariaLabel ?? (ariaLabelledby || ariaHidden ? undefined : 'Progress')
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-busy={indeterminate || undefined}
        aria-label={name}
        aria-labelledby={ariaLabelledby}
        aria-hidden={ariaHidden}
        className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
        {...props}
      >
        <div
          className={cn(
            'h-full rounded-full bg-primary',
            indeterminate
              ? 'w-1/4 animate-progress-indeterminate'
              : // No transition on the indeterminate sliver: the keyframe owns its transform, and
                // a transition on `width` would fight it every time React re-renders.
                'transition-all',
            indicatorClassName
          )}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    )
  }
)
Progress.displayName = 'Progress'

export { Progress }
