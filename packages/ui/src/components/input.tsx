import * as React from 'react'
import { cn } from '../lib/utils'

export type InputVariant = 'default' | 'chrome' | 'ghost'

// `md` is the standard 36px form field; `sm` is the compact 28px field used by dense
// chrome (toolbar/popover searches, inline editors) that would otherwise hand-roll a
// bare `<input>` to escape the taller default.
export type InputSize = 'sm' | 'md'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant
  /** Field density. `md` (default) is the 36px form field; `sm` is the compact 28px field. */
  inputSize?: InputSize
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

// Colour the icon slots inherit by default. An icon sits *inside* the field, so it has to be
// graded against the field's own fill, exactly like the text and the placeholder above — left to
// the cascade it picks up whatever colour the surrounding panel happens to use, which on `chrome`'s
// saturated accent fill is how you end up with a search icon that doesn't match its own placeholder.
// A colour class on the icon element itself still wins (it's a different element, not a conflict).
const ICON_CLASSES: Record<InputVariant, string> = {
  default: 'text-muted-foreground',
  chrome: 'text-sidebar-accent-foreground',
  ghost: 'text-muted-foreground',
}

const BASE =
  'flex w-full rounded-md border outline-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50'

const SIZE_CLASSES: Record<InputSize, string> = {
  md: 'h-9 px-3 py-1 text-sm shadow-sm',
  sm: 'h-7 px-2 py-0.5 text-xs',
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      variant = 'default',
      inputSize = 'md',
      type,
      startIcon,
      endIcon,
      autoCapitalize = 'off',
      autoCorrect = 'off',
      spellCheck = false,
      ...props
    },
    ref
  ) => {
    const field = (
      <input
        type={type}
        ref={ref}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        className={cn(
          BASE,
          SIZE_CLASSES[inputSize],
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
          <span
            className={cn(
              'pointer-events-none absolute left-2 top-1/2 flex -translate-y-1/2 items-center',
              ICON_CLASSES[variant]
            )}
          >
            {startIcon}
          </span>
        )}
        {field}
        {endIcon && (
          <span
            className={cn(
              'absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center',
              ICON_CLASSES[variant]
            )}
          >
            {endIcon}
          </span>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
