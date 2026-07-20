import * as React from 'react'
import { cn } from '../lib/utils'

// A minimal, themed `<label>` for form controls. Nothing exotic — it exists so
// forms stop hand-rolling `text-xs font-medium text-foreground` on raw `<label>`
// elements, and so `htmlFor` / peer-disabled styling are consistent. Pair it with
// Checkbox / Switch / RadioGroupItem via `htmlFor`, or wrap the control to get an
// implicit association.
export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'text-xs font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className
    )}
    {...props}
  />
))
Label.displayName = 'Label'

export { Label }
