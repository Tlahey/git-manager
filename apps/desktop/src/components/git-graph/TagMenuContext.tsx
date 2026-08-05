import type { ReactNode } from 'react'
import { TagMenuContext, type TagMenuHandler } from './useTagMenuHandler'

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
