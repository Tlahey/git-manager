import * as React from 'react'
import { cn } from '../lib/utils'

// A determinate progress bar (download %, contribution meters). Centralises the
// track/fill tokens the ad-hoc `rounded-full bg-muted` + `bg-primary` bars repeated,
// and — unlike those bare divs — exposes proper `role="progressbar"` + aria-value*
// so assistive tech announces the amount. `value` is a 0–100 percentage.
export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  /** Extra classes for the fill (e.g. a tone colour); defaults to bg-primary. */
  indicatorClassName?: string
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      value = 0,
      className,
      indicatorClassName,
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
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={name}
        aria-labelledby={ariaLabelledby}
        aria-hidden={ariaHidden}
        className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
        {...props}
      >
        <div
          className={cn('h-full rounded-full bg-primary transition-all', indicatorClassName)}
          style={{ width: `${pct}%` }}
        />
      </div>
    )
  }
)
Progress.displayName = 'Progress'

export { Progress }
