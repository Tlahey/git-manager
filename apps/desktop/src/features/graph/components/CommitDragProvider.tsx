import type { ReactNode } from 'react'
import { CommitDragContext, type CommitDragContextValue } from '../hooks/useCommitRowDrag'

/** Provides the commit drag-and-drop wiring to every `GraphRow` rendered underneath. */
export function CommitDragProvider({
  value,
  children,
}: {
  value: CommitDragContextValue
  children: ReactNode
}) {
  return <CommitDragContext.Provider value={value}>{children}</CommitDragContext.Provider>
}
