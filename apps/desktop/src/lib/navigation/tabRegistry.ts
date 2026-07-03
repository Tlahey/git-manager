import type { ComponentType, ReactNode } from 'react'

/**
 * One entry = one tab: its id, its nav label/icon, and how to render its content.
 * `render` is a thunk (not a bare component) so a page can close over whatever local
 * state/props that specific tab's content needs (e.g. PullRequestsPage's tabs each take a
 * different prop shape) without forcing a uniform component signature across all tabs.
 */
export interface TabDef<Id extends string> {
  id: Id
  label: string
  icon?: ComponentType<{ className?: string }>
  render: () => ReactNode
}

/** Identity helper — gives every call site a single typed array to maintain (nav + content
 * switch both read from it) instead of a hand-duplicated type + nav list + render chain. */
export function defineTabs<Id extends string>(tabs: TabDef<Id>[]): TabDef<Id>[] {
  return tabs
}

/** Renders whichever tab's content matches `activeId`, or null if none matches. */
export function renderActiveTab<Id extends string>(tabs: TabDef<Id>[], activeId: Id): ReactNode {
  return tabs.find((t) => t.id === activeId)?.render() ?? null
}
