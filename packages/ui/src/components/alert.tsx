import * as React from 'react'
import { cn } from '../lib/utils'

export type AlertVariant = 'destructive' | 'success' | 'warning' | 'info'

// A block message box (form errors, success/warning/info callouts) — the shared home
// for the ad-hoc `rounded border bg-<tone>/10 text-<tone>` boxes that were repeated
// across dialogs and panels. Like `Tag`, the fill is a translucent tone tint and the
// TEXT rides the graded --tone-*-foreground tokens, so it adapts per surface and
// clears APCA (the previous boxes hard-coded palette shades like amber-500 / red-500 /
// emerald-500, which don't retint per theme and failed the a11y matrix). No forced
// ARIA role: it renders as a plain styled container to match the divs it replaces —
// pass `role="alert"` / `aria-live` yourself for dynamically-appearing messages.
const VARIANT_CLASSES: Record<AlertVariant, string> = {
  destructive: 'border-destructive/25 bg-destructive/10 text-tone-danger',
  success: 'border-success/25 bg-success/10 text-tone-success',
  warning: 'border-amber-500/25 bg-amber-500/10 text-tone-warning',
  info: 'border-blue-500/25 bg-blue-500/10 text-tone-info',
}

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant
  /** Optional leading icon (colour is inherited from the tone). */
  icon?: React.ReactNode
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ variant = 'destructive', icon, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-start gap-2 rounded-md border p-3 text-xs',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {icon && (
        <span aria-hidden="true" className="mt-px shrink-0">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
)
Alert.displayName = 'Alert'

export { Alert }
