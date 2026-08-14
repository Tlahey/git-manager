import type { ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'
import { VisibilityToggle } from './VisibilityToggle'
import { HoverExpandLabel } from './HoverExpandLabel'
import { shortOid } from '../../../lib/shortOid'

interface SidebarHideableRowProps {
  /** `tag` or `stash` — names this row's `data-toggle` markers, nothing more. */
  kind: string
  /** Leading icon, already coloured by the caller: a tag and a stash do not look alike. */
  icon: ReactNode
  /** The row's label, already highlighted against the panel's search query. */
  label: ReactNode
  /** Commit the row points at — shown shortened on the right. */
  commitOid: string
  isSelected: boolean
  /** Whether the row's badge is kept off the graph; dims the row and flips the toggle. */
  isHidden: boolean
  onSelect: () => void
  onOpenMenu: (e: React.MouseEvent) => void
  onToggleVisibility: () => void
  /** What the eye toggle says it will do, which depends on the current state. */
  visibilityLabel: string
  /** What the "…" button says it opens. */
  actionsLabel: string
  testId: string
  actionsTestId: string
  /** Stretches the label to fill the row. A stash message is long; a tag name is not. */
  labelFills?: boolean
}

/**
 * A sidebar row that points at a commit and can be hidden from the graph: a tag, or a stash.
 *
 * These were two near-identical copies in `SidebarRowView`'s switch — same shell, same class
 * strings, same click / right-click / Enter handling, same eye toggle, same shortened oid, same
 * hover-revealed "…" button — differing only in their icon, their label and what selecting them
 * does. 130 lines for one idea, and a fix to one row silently leaving the other behind.
 *
 * Both marker attributes matter to behaviour and are the reason the row is not a plain button: the
 * eye toggle and the "…" button carry `data-toggle`, and the row's own click and Enter handlers skip
 * anything inside such an element — otherwise activating either with the keyboard would also select
 * the row.
 */
export function SidebarHideableRow({
  kind,
  icon,
  label,
  commitOid,
  isSelected,
  isHidden,
  onSelect,
  onOpenMenu,
  onToggleVisibility,
  visibilityLabel,
  actionsLabel,
  testId,
  actionsTestId,
  labelFills,
}: SidebarHideableRowProps) {
  /** True when the event started inside the eye toggle or the "…" button. */
  const onOwnControl = (target: EventTarget | null) =>
    !!(target as HTMLElement | null)?.closest?.('[data-toggle]')

  return (
    <div
      className={`group/row relative flex cursor-pointer items-center gap-1.5 py-[3px] pr-6 pl-6 text-xs transition-colors ${
        isSelected
          ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
          : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
      } ${isHidden ? 'opacity-50' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        if (onOwnControl(e.target)) return
        onSelect()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpenMenu(e)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key !== 'Enter') return
        if (onOwnControl(e.target)) return
        onSelect()
      }}
      data-testid={testId}
    >
      <VisibilityToggle
        isHidden={isHidden}
        onToggle={onToggleVisibility}
        label={visibilityLabel}
        dataToggle={`${kind}-visibility`}
        hoverClass="group-hover/row:opacity-100"
      />
      {icon}
      <HoverExpandLabel className={labelFills ? 'min-w-0 flex-1 truncate' : undefined}>
        {label}
      </HoverExpandLabel>
      <span className="shrink-0 font-mono text-[10px] font-normal text-sidebar-muted-foreground/40 tabular-nums">
        {shortOid(commitOid)}
      </span>
      {/* Same actions as the row's right-click, reachable by pointing — the context menu was the
          only way in, which is not something a hover-only affordance advertises. It opens the very
          same native menu spec rather than a second, forkable definition of it. */}
      <button
        // Marked like the visibility toggle so the row's own click/Enter handlers skip it —
        // otherwise activating it with the keyboard would also select the row.
        data-toggle={`${kind}-actions`}
        onClick={(e) => {
          e.stopPropagation()
          onOpenMenu(e)
        }}
        className="absolute top-1/2 right-1 shrink-0 -translate-y-1/2 cursor-pointer rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all group-hover/row:opacity-100 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
        aria-label={actionsLabel}
        title={actionsLabel}
        data-testid={actionsTestId}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
