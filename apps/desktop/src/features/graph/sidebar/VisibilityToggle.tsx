import { Eye, EyeOff } from 'lucide-react'

interface VisibilityToggleProps {
  /** Eye-off state: the row's badge (or every badge under it) is kept out of the graph. */
  isHidden: boolean
  onToggle: () => void
  /** Names the action — the control is icon-only, so this is its whole accessible name. */
  label: string
  /**
   * `data-toggle` marker. The rows check `closest('[data-toggle]')` in their own click/Enter
   * handlers, so a toggle without one would also select the row it sits on.
   */
  dataToggle: string
  /**
   * Class revealing the toggle on the row's hover group, e.g. `group-hover/tag:opacity-100`.
   * Passed in rather than derived: Tailwind only emits classes it can read literally in the source.
   */
  hoverClass: string
  /**
   * Group rows only: some but not all of what is below is hidden. The eye stays (the group is not
   * hidden) but is dimmed, and — like a fully hidden row — it no longer waits for a hover.
   */
  partial?: boolean
  testId?: string
}

/**
 * Left-edge eye / eye-off toggle for a sidebar row whose graph badge can be hidden — tags, stashes
 * and remote branches alike.
 *
 * It is a hover affordance while the row shows, but pinned on screen once the row is hidden: the
 * icon is the only thing saying so, and an affordance that only appears under the pointer would
 * leave that state invisible at rest.
 */
export function VisibilityToggle({
  isHidden,
  onToggle,
  label,
  dataToggle,
  hoverClass,
  partial = false,
  testId,
}: VisibilityToggleProps) {
  return (
    <button
      type="button"
      data-toggle={dataToggle}
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onToggle()
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onMouseUp={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      className={`absolute left-1 z-content shrink-0 cursor-pointer rounded p-0.5 text-sidebar-muted-foreground transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-foreground ${
        isHidden || partial ? 'opacity-100' : `opacity-0 ${hoverClass}`
      }`}
      title={label}
      aria-label={label}
      aria-pressed={isHidden}
    >
      {isHidden ? (
        <EyeOff className="h-3.5 w-3.5 text-sidebar-muted-foreground/60" />
      ) : (
        <Eye className={`h-3.5 w-3.5 ${partial ? 'text-violet-400/40' : 'text-violet-400'}`} />
      )}
    </button>
  )
}
