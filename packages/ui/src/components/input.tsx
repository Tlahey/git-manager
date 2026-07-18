import * as React from 'react'
import { cn } from '../lib/utils'

export type InputVariant = 'default' | 'chrome' | 'ghost'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant
  /** Icon rendered inside the field on the leading edge (styling/colour is the caller's). */
  startIcon?: React.ReactNode
  /** Element rendered inside the field on the trailing edge — e.g. a clear button. */
  endIcon?: React.ReactNode
  /** Extra classes for the wrapper div (only rendered when an icon slot is used). */
  containerClassName?: string
}

// Placeholders use the FULL-opacity muted token on purpose: the previous ad-hoc
// `/60` placeholders were too faint to read (esp. on Twilight's chrome).
const VARIANT_CLASSES: Record<InputVariant, string> = {
  // Content surfaces (dialogs, forms) — the shadcn default.
  default: 'border-input bg-transparent placeholder:text-muted-foreground focus-visible:ring-ring',
  // Nav chrome (sidebar filter, toolbar search): the field fill is sidebar-accent,
  // so its text + placeholder must use sidebar-accent-*foreground* — the pair the
  // theme grades as AA — not sidebar-foreground, which is only guaranteed against
  // sidebar-background (it washed out on light/saturated accents like nord's frost
  // and platinum's magenta).
  chrome:
    'border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground placeholder:text-sidebar-accent-foreground focus-visible:ring-ring',
  // Borderless (inline search rows inside a popover).
  ghost: 'border-transparent bg-transparent placeholder:text-muted-foreground focus-visible:ring-0',
}

const BASE =
  'flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm outline-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50'

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, containerClassName, variant = 'default', type, startIcon, endIcon, ...props },
    ref
  ) => {
    const field = (
      <input
        type={type}
        ref={ref}
        className={cn(
          BASE,
          VARIANT_CLASSES[variant],
          startIcon && 'pl-8',
          endIcon && 'pr-8',
          className
        )}
        {...props}
      />
    )

    if (!startIcon && !endIcon) return field

    return (
      <div className={cn('relative', containerClassName)}>
        {startIcon && (
          <span className="pointer-events-none absolute left-2 top-1/2 flex -translate-y-1/2 items-center">
            {startIcon}
          </span>
        )}
        {field}
        {endIcon && (
          <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
            {endIcon}
          </span>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
