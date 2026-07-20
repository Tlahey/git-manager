import * as React from 'react'
import { cn } from '../lib/utils'

// A themed on/off switch built on a native `<input type="checkbox">` carrying
// `role="switch"` — so it exposes the correct on/off semantics to assistive tech
// while keeping native keyboard operation (Space toggles, Tab focuses) and form
// participation for free. The track + thumb are sibling elements driven by Tailwind
// `peer-*` variants; the input is `sr-only` (focusable, never removed from the DOM).
// Replaces the ad-hoc `peer sr-only` toggle duplicated in NotificationSection /
// DebugSection / AiSection.
export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, disabled, ...props }, ref) => (
    <span
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        disabled={disabled}
        className="peer sr-only"
        {...props}
      />
      {/* Track. The "on" fill rides the `badge` component-token (deep, APCA-safe brand
          fill on light-content themes like Twilight; == --primary elsewhere) rather
          than raw --primary, so the white thumb keeps contrast on every theme. */}
      <span
        aria-hidden="true"
        data-contrast-ground
        className={cn(
          'pointer-events-none absolute inset-0 rounded-full bg-muted transition-colors',
          'peer-checked:bg-badge',
          'peer-focus-visible:ring-1 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background'
        )}
      />
      {/* Thumb. It must contrast with WHATEVER track sits under it, and the track
          differs by state — bg-muted (off) vs bg-badge (on). A single fill like
          bg-background breaks in dark themes (near-black thumb on a dark muted track =
          invisible). So pair the thumb with each track's graded foreground token:
          muted-foreground over the off track, badge-foreground over the on track —
          both are contrast-graded pairs in @git-manager/theme, so the thumb stays
          visible on every theme by construction. */}
      <span
        aria-hidden="true"
        data-contrast-mark="switch-thumb"
        className={cn(
          'pointer-events-none absolute left-[2px] h-4 w-4 rounded-full bg-muted-foreground transition-all',
          'peer-checked:translate-x-4 peer-checked:bg-badge-foreground'
        )}
      />
    </span>
  )
)
Switch.displayName = 'Switch'

export { Switch }
