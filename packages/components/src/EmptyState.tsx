import type { ReactNode } from 'react'

/**
 * The two ways a list can have nothing to show, which are not the same message.
 *
 * `EmptyState` is "there is nothing here yet" — a first-run condition the user can usually act on,
 * so it is prominent and can carry a call to action. `NoResults` is "your filter matched nothing" —
 * a transient consequence of what was just typed, so it is quiet and offers nothing to press: the
 * way out is the filter the user still has in front of them.
 *
 * Telling them apart in one shared pair rather than per screen is the point. They were written out
 * by hand nine times across the Launchpad alone and had already drifted into three different
 * vertical paddings for what is the same message in the same kind of list.
 */

export interface EmptyStateProps {
  /** Framed above the title. Sized by the caller; `h-6 w-6` matches the frame. */
  icon: ReactNode
  title: string
  description: string
  /** A single call to action, when there is something to do about it. */
  action?: ReactNode
}

/** Prominent empty state: a framed icon, a heading, a line of explanation, and optionally one
 * button. For a list that has no content at all rather than no *matching* content. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5">
        {icon}
      </div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
      <p className={`max-w-[280px] text-xs text-muted-foreground ${action ? 'mb-4' : ''}`}>
        {description}
      </p>
      {action}
    </div>
  )
}

export interface NoResultsProps {
  /** Dimmed above the message. An emoji or any node works as well as an icon. */
  icon: ReactNode
  message: string
}

/** Quiet "nothing matched" state, for a list whose filter or search excluded everything. */
export function NoResults({ icon, message }: NoResultsProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground/50">
      {icon}
      <p className="text-xs">{message}</p>
    </div>
  )
}
