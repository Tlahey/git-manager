import { createContext, useContext, type ReactNode } from 'react'
import type { GitRef } from '@git-manager/git-types'

/** Tag context-menu handler shared with the deep `RefLabel` badges so they don't need graph props. */
export type TagMenuHandler = (e: React.MouseEvent, gitRef: GitRef) => void

const TagMenuContext = createContext<TagMenuHandler | null>(null)

/**
 * Provides the tag context-menu opener to every `RefLabel` rendered underneath. Unlike
 * {@link RefDropProvider}, the handler is built by the graph (it needs the graph's selection and
 * pending-action wiring) and passed in here.
 */
export function TagMenuProvider({
  handler,
  children,
}: {
  handler: TagMenuHandler
  children: ReactNode
}) {
  return <TagMenuContext.Provider value={handler}>{children}</TagMenuContext.Provider>
}

/** The tag-menu handler, or `null` outside a provider (e.g. lane-hint badges, tests). */
export function useTagMenuHandler(): TagMenuHandler | null {
  return useContext(TagMenuContext)
}
