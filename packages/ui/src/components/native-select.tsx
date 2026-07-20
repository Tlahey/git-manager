import * as React from 'react'
import { cn } from '../lib/utils'

// A themed native `<select>` — the counterpart to `Input` for dropdowns. The app's
// menus were all hand-rolled `<select>`s repeating the same border/bg/focus classes;
// this centralises those design tokens (and the disabled + focus-visible ring) in one
// place while keeping the native element, so keyboard, type-ahead, mobile pickers and
// form semantics come for free. Deliberately NOT the Radix `Select` (a custom listbox
// with heavier markup) — this is a drop-in for `value`/`onChange`/`<option>` call
// sites. Pass `className` to tune size/width per context (tailwind-merge lets it win
// over the base), exactly like `Input`.
export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

const BASE =
  'h-8 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(BASE, className)} {...props}>
      {children}
    </select>
  )
)
NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
