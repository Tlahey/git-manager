import * as React from 'react'
import { cn } from '../lib/utils'

// A themed radio group built on native `<input type="radio">` elements sharing a
// `name` — so the browser gives us correct grouping, arrow-key roving focus and
// form participation with no JS. A small context passes the group's `name`, the
// selected `value`, the change handler and a group-level `disabled` down to each
// `RadioGroupItem`, mirroring the Radix API shape used elsewhere in this package
// while staying dependency-free. Replaces the ad-hoc `type="radio"` rows in
// AppearanceSection (density / row height).

interface RadioGroupContextValue {
  name: string
  value?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null)

let radioGroupCount = 0

export interface RadioGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Controlled selected value. */
  value?: string
  /** `name` shared by every radio input; auto-generated when omitted. */
  name?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, name, onValueChange, disabled, children, ...props }, ref) => {
    // Stable auto-name so uncontrolled groups still bind their radios together.
    const generatedName = React.useMemo(() => `radio-group-${++radioGroupCount}`, [])
    const groupName = name ?? generatedName

    return (
      <RadioGroupContext.Provider value={{ name: groupName, value, onValueChange, disabled }}>
        <div ref={ref} role="radiogroup" className={cn('flex flex-col gap-2', className)} {...props}>
          {children}
        </div>
      </RadioGroupContext.Provider>
    )
  }
)
RadioGroup.displayName = 'RadioGroup'

export interface RadioGroupItemProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'checked'> {
  /** The value this radio represents within the group. */
  value: string
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, disabled, ...props }, ref) => {
    const ctx = React.useContext(RadioGroupContext)
    if (!ctx) {
      throw new Error('RadioGroupItem must be used within a RadioGroup')
    }
    const isDisabled = disabled ?? ctx.disabled

    return (
      <span className={cn('relative inline-flex h-4 w-4 shrink-0', className)}>
        <input
          ref={ref}
          type="radio"
          name={ctx.name}
          value={value}
          checked={ctx.value === value}
          disabled={isDisabled}
          onChange={() => ctx.onValueChange?.(value)}
          className="peer sr-only"
          {...props}
        />
        {/* Ring — when selected it FILLS with `bg-badge` (not just a coloured border)
            so the centre dot sits on the badge token, whose foreground is a graded pair
            (like the checkbox tick). A coloured dot on a `bg-background` interior looked
            fine on content surfaces but collapsed to ~1:1 on the chrome/sidebar surface,
            where --background and --badge drift together — the graphical-contrast gate
            caught it. Filling with badge keeps the dot's contrast guaranteed on every
            theme AND surface. */}
        <span
          aria-hidden="true"
          data-contrast-ground
          className={cn(
            'pointer-events-none absolute inset-0 rounded-full border border-border bg-background transition-colors',
            'peer-checked:border-badge peer-checked:bg-badge',
            'peer-focus-visible:ring-1 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background',
            'peer-disabled:opacity-50'
          )}
        />
        {/* Centre dot — badge-foreground on the badge fill (graded pair). */}
        <span
          aria-hidden="true"
          data-contrast-mark="radio-dot"
          className={cn(
            'pointer-events-none absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-badge-foreground opacity-0 transition-opacity',
            'peer-checked:opacity-100'
          )}
        />
      </span>
    )
  }
)
RadioGroupItem.displayName = 'RadioGroupItem'

export { RadioGroup, RadioGroupItem }
