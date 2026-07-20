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
 *
 * The inactive label INHERITS its surface's foreground (`text-inherit`) rather than
 * riding `text-muted-foreground`: at 10px/600 the muted token only reached ~53Lc
 * (below APCA Bronze 75), and it needs a token that flips per surface — dark on
 * content, light on the chrome/sidebar surface — which a single foreground token
 * can't do but inheritance can (each surface sets its own `*-foreground`). The
 * active-vs-inactive distinction stays clear via the filled accent fill + bold weight.
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
          : 'border-border bg-card/30 text-inherit hover:bg-card/60',
        className
      )}
      {...props}
    />
  )
)
Chip.displayName = 'Chip'

export { Chip }
