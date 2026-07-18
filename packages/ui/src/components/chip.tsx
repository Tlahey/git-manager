import * as React from 'react'
import { cn } from '../lib/utils'

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

/**
 * A pill-shaped toggle for segmented filters / status switches. The active state
 * rides the graded button component tokens (--button-bg / --button-foreground) so
 * its label stays WCAG AA on every theme — including Twilight, whose light-violet
 * button override applies here for free, replacing the ad-hoc `bg-primary` pills
 * that rendered near-black text on saturated violet.
 */
const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ active = false, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        'cursor-pointer rounded-full border px-3 py-1 text-[10px] font-semibold transition-all',
        active
          ? 'border-button bg-button font-bold text-button-foreground shadow-sm'
          : 'border-border bg-card/30 text-muted-foreground hover:text-foreground',
        className
      )}
      {...props}
    />
  )
)
Chip.displayName = 'Chip'

export { Chip }
