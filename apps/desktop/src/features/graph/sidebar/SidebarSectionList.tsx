import type { ComponentProps, Ref } from 'react'
import { SidebarRowView } from './SidebarRowView'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import {
  resolveSectionHeaderActions,
  type SectionHeaderActionHandlers,
} from './sectionHeaderActions.config'
import {
  MIN_SECTION_BODY_HEIGHT,
  MIN_SECTION_HEIGHT,
  type SectionKey,
  type SidebarSection,
} from './types'

/** Everything a row needs that is the same for every row on the panel. The three that are not — the
 *  row itself, the saved-filter menu (which differs between the PR and issue sections) and the open
 *  toggle (resolved against `openById` below) — are passed separately. */
export type SidebarRowHandlers = Omit<
  ComponentProps<typeof SidebarRowView>,
  'row' | 'onIssueFilterMenu' | 'onToggleOpen'
>

interface SidebarSectionListProps {
  sections: SidebarSection[]
  /** Open state of every collapsible id (sections and their sub-groups), to resolve a toggle
   *  against the state it is flipping. */
  openById: Map<string, boolean>
  onToggleOpen: (id: string, currentlyOpen: boolean) => void
  /** Section waiting to be scrolled into view, and the ref that does it — attached to that one
   *  section only, so it fires on the very render that opens it. */
  sectionToReveal: SectionKey | null
  revealSectionRef: Ref<HTMLDivElement>
  isFiltered: boolean
  sectionHeaderActions: SectionHeaderActionHandlers
  rowHandlers: SidebarRowHandlers
  onPrFilterMenu: ComponentProps<typeof SidebarRowView>['onIssueFilterMenu']
  onIssueFilterMenu: ComponentProps<typeof SidebarRowView>['onIssueFilterMenu']
}

/**
 * The scrollable body of the sidebar: every section, its header, and its rows.
 *
 * Every open section is `flex-1` (equal weight, 0% basis): open sections always split the available
 * height in strictly equal shares, even a sparse section (e.g. a single worktree) — that's
 * intentional, so every open section lines up on the same height. Each open section has a floor
 * (min-height) set explicitly via inline style rather than relying on the automatic minimum size
 * derived from content (see the `MIN_SECTION_HEIGHT` comment in types.ts for why — that's what
 * caused unbounded growth and then overlap with the following sections). If the sum of the open
 * sections' floors exceeds the panel's height, the whole section list becomes scrollable (a single
 * global scrollbar). Closed sections stay `flex-none` (never shrink below their header).
 */
export function SidebarSectionList({
  sections,
  openById,
  onToggleOpen,
  sectionToReveal,
  revealSectionRef,
  isFiltered,
  sectionHeaderActions,
  rowHandlers,
  onPrFilterMenu,
  onIssueFilterMenu,
}: SidebarSectionListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      {sections.map((section) => (
        <div
          key={section.key}
          ref={section.key === sectionToReveal ? revealSectionRef : undefined}
          className={`flex flex-col border-b border-sidebar-border last:border-b-0 ${
            section.isOpen ? 'flex-1' : 'flex-none'
          }`}
          style={section.isOpen ? { minHeight: MIN_SECTION_HEIGHT } : undefined}
          data-testid={`sidebar-section-container-${section.key}`}
        >
          <SidebarSectionHeader
            sectionKey={section.key}
            title={section.title}
            count={section.count}
            isOpen={section.isOpen}
            onToggle={() => onToggleOpen(`section:${section.key}`, section.isOpen)}
            {...resolveSectionHeaderActions(section.key, sectionHeaderActions)}
            isFiltered={isFiltered}
          />
          {section.isOpen && (
            <div className="flex-1 overflow-y-auto" style={{ minHeight: MIN_SECTION_BODY_HEIGHT }}>
              {section.rows.map((row) => (
                <SidebarRowView
                  key={row.id}
                  row={row}
                  {...rowHandlers}
                  onToggleOpen={(id) => onToggleOpen(id, openById.get(id) ?? false)}
                  onIssueFilterMenu={section.key === 'prs' ? onPrFilterMenu : onIssueFilterMenu}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
