import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '../lib/utils'

// A themed, accessible checkbox built on a native `<input type="checkbox">` — the
// a11y gold standard (real form semantics, keyboard, focus, indeterminate). The
// visible box + markers are sibling elements painted from theme tokens; the input
// itself is `sr-only` (kept in the DOM and focusable, never `display:none`, so it
// stays operable by keyboard and assistive tech). Everything reacts through
// Tailwind `peer-*` variants, so the box, checkmark and dash are all DIRECT siblings
// of the input — the general-sibling combinator behind `peer-checked:` cannot reach
// a descendant of a sibling. Replaces the ad-hoc `h-4 w-4 rounded border-border`
// inputs scattered across the settings sections.
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Render the mixed/tri-state visual and set `aria-checked="mixed"`. */
  indeterminate?: boolean
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate = false, checked, disabled, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement>(null)

    // The indeterminate state is DOM-only (no HTML attribute), so sync it imperatively.
    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate
    }, [indeterminate])

    // Merge the forwarded ref with our internal one.
    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement)

    return (
      <span className={cn('relative inline-flex h-4 w-4 shrink-0', className)}>
        <input
          ref={innerRef}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-checked={indeterminate ? 'mixed' : undefined}
          className="peer sr-only"
          {...props}
        />
        {/* Box. The checked/indeterminate fill rides the `badge` component-token pair,
            NOT raw --primary: on light-content themes (Twilight/nord/platinum) --primary
            is a light violet that no dark glyph can clear on (APCA Bronze tops out
            ~64Lc), so those themes re-point --badge-bg to a deeper brand fill with a
            light --badge-foreground glyph — the same fix the Button/Badge use. On every
            other theme --badge-bg defaults to --primary, so the look is unchanged. */}
        <span
          aria-hidden="true"
          data-contrast-ground
          className={cn(
            'pointer-events-none absolute inset-0 rounded border border-border bg-background transition-colors',
            'peer-checked:border-badge peer-checked:bg-badge',
            'peer-indeterminate:border-badge peer-indeterminate:bg-badge',
            'peer-focus-visible:ring-1 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background',
            'peer-disabled:opacity-50'
          )}
        />
        {/* Checkmark — shown when checked (and not indeterminate) */}
        <Check
          aria-hidden="true"
          data-contrast-mark="checkbox-tick"
          strokeWidth={3}
          className={cn(
            'pointer-events-none absolute inset-0 m-auto h-3 w-3 text-badge-foreground opacity-0 transition-opacity',
            'peer-checked:opacity-100 peer-indeterminate:opacity-0'
          )}
        />
        {/* Dash — shown when indeterminate */}
        <span
          aria-hidden="true"
          data-contrast-mark="checkbox-dash"
          className={cn(
            'pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-0.5 w-2 -translate-y-1/2 rounded-full bg-badge-foreground opacity-0',
            'peer-indeterminate:opacity-100'
          )}
        />
      </span>
    )
  }
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
