import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useBoardStore } from '../stores/board.store'

interface CardContentSectionProps {
  title: string
  /** Key the collapsed state is remembered under — per section, shared by every card. */
  sectionKey: string
  testId: string
  /** Rendered in the heading, right of the title — a progress read-out, a count, a toolbar. */
  aside?: ReactNode
  children: ReactNode
}

/**
 * One collapsible block of the card dialog's content column — description, checklist, relations,
 * discussion.
 *
 * The heading is a real heading (dark, weighted) rather than the small uppercase caption the side
 * panel's fields use: these are the *parts of the document*, and they compete with the body text for
 * attention on purpose, so a long card can be skimmed by its structure. Folding is remembered per
 * section across cards — see `board.store.ts`.
 */
export function CardContentSection({
  title,
  sectionKey,
  testId,
  aside,
  children,
}: CardContentSectionProps) {
  const collapsed = useBoardStore((s) => s.isCardSectionCollapsed(sectionKey))
  const toggle = useBoardStore((s) => s.toggleCardSectionCollapsed)

  return (
    <section data-testid={testId} className="border-b border-border px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => toggle(sectionKey)}
          aria-expanded={!collapsed}
          data-testid={`${testId}-toggle`}
          className="-ml-1 flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-accent"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-[13px] font-semibold text-foreground">{title}</span>
        </button>
        {/* Stays visible while the section is folded: a checklist's "1/5" is exactly what tells you
            whether it is worth unfolding. */}
        {aside}
      </div>
      {!collapsed && children}
    </section>
  )
}
