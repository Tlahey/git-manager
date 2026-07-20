import * as React from 'react'
import { cn } from '../lib/utils'

// A themed loading placeholder — the shared home for the `animate-pulse rounded bg-…`
// blocks that were duplicated across loading states. Purely decorative, so it's
// `aria-hidden` by default (screen readers should hear a live "loading" message from
// the container, not a pile of empty boxes). Size/shape it with `className`.
export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
)
Skeleton.displayName = 'Skeleton'

export { Skeleton }
