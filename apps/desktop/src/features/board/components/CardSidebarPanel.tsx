import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useBoardStore } from '../stores/board.store'

interface CardSidebarPanelProps {
  title: string
  /** Key the collapsed state is remembered under — per panel, shared by every card. */
  sectionKey: string
  testId: string
  children: ReactNode
}

/**
 * A named, collapsible group of fields in the card's side panel.
 *
 * Grouping is what makes a dozen fields readable: the two or three that get touched on every card
 * sit in their own panel above the rest, so the common edits are always in the same place regardless
 * of how many fields the card model grows. Collapsing is remembered per panel rather than per card —
 * see `board.store.ts`.
 */
export function CardSidebarPanel({ title, sectionKey, testId, children }: CardSidebarPanelProps) {
  const collapsed = useBoardStore((s) => s.isCardSectionCollapsed(sectionKey))
  const toggle = useBoardStore((s) => s.toggleCardSectionCollapsed)

  return (
    <section
      data-testid={testId}
      className="overflow-hidden rounded-md border border-border bg-background/40"
    >
      <button
        type="button"
        onClick={() => toggle(sectionKey)}
        aria-expanded={!collapsed}
        data-testid={`${testId}-toggle`}
        className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left hover:bg-accent/50"
      >
        <span className="flex-1 text-xs font-semibold text-foreground">{title}</span>
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {!collapsed && <div className="pb-2">{children}</div>}
    </section>
  )
}
