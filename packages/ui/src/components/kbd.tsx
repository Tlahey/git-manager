import * as React from 'react'
import { cn } from '../lib/utils'

// A keyboard-key cap for shortcut hints. Centralises the border/bg/text tokens the
// ad-hoc `<kbd>` styling repeated, so key caps stay legible on every theme.
export type KbdProps = React.HTMLAttributes<HTMLElement>

const Kbd = React.forwardRef<HTMLElement, KbdProps>(({ className, ...props }, ref) => (
  <kbd
    ref={ref}
    className={cn(
      'inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-bold text-foreground shadow-sm',
      className
    )}
    {...props}
  />
))
Kbd.displayName = 'Kbd'

export { Kbd }
