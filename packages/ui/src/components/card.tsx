import * as React from 'react'
import { cn } from '../lib/utils'

// A surface container — the shared home for the `rounded-* border border-border
// bg-card` panels repeated across Settings, the dashboard and the PR tabs. It fixes
// only the tokens that must stay consistent (the card border + fill + its graded
// text colour) and a sane default radius; the per-use bits callers actually vary —
// the bg opacity (bg-card/30…), padding, shadow, radius size — stay in `className`
// and win via tailwind-merge. Keeping it a plain div (no forced padding) means it
// drops in over the existing markup without reflowing anything.
export type CardProps = React.HTMLAttributes<HTMLDivElement>

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('rounded-lg border border-border bg-card text-card-foreground', className)}
    {...props}
  />
))
Card.displayName = 'Card'

export { Card }
