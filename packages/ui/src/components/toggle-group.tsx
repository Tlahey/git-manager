import * as React from 'react'
import { cn } from '../lib/utils'
import { Tooltip } from './tooltip'

let toggleGroupCount = 0

export interface ToggleGroupOption<T extends string = string> {
  value: T
  icon: React.ReactNode
  /** Accessible name for this option — shown as a Tooltip (pointer) and read by
   * assistive tech (sr-only label text); never a raw `title=` attribute. */
  label: string
}

export interface ToggleGroupProps<T extends string = string> {
  value: T
  onValueChange: (value: T) => void
  options: ToggleGroupOption<T>[]
  /** Native radio `name` shared by every option; auto-generated when omitted. */
  name?: string
  className?: string
}

/**
 * Icon-only segmented control (e.g. tree/list view toggles) built on the same
 * sr-only-native-radio foundation as a labelled radio group — native `name` grouping
 * gives free keyboard roving focus and form semantics — generalized for options that
 * have no visible text: each one gets a Tooltip for pointer users and an sr-only label
 * for its accessible name instead of a raw `title=` attribute.
 */
export function ToggleGroup<T extends string = string>({
  value,
  onValueChange,
  options,
  name,
  className,
}: ToggleGroupProps<T>) {
  const generatedName = React.useMemo(() => `toggle-group-${++toggleGroupCount}`, [])
  const groupName = name ?? generatedName

  return (
    <div
      className={cn(
        'inline-flex items-center overflow-hidden rounded border border-border/55 bg-card',
        className
      )}
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <Tooltip key={option.value} content={option.label}>
            <label
              className={cn(
                'flex cursor-pointer items-center p-1.5 transition-colors',
                checked
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={checked}
                onChange={() => onValueChange(option.value)}
                className="sr-only"
              />
              <span aria-hidden="true">{option.icon}</span>
              <span className="sr-only">{option.label}</span>
            </label>
          </Tooltip>
        )
      })}
    </div>
  )
}
