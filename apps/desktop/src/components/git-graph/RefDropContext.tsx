import { createContext, useContext, type ReactNode } from 'react'
import type { GitRef } from '@git-manager/git-types'
import { useRefDrop } from '../../hooks/useRefDrop'

/** Drop handler shared with the deep `RefLabel` badges so they don't need the graph's props. */
type RefDropHandler = (source: GitRef, target: GitRef) => void

const RefDropContext = createContext<RefDropHandler | null>(null)

/** Provides the branch/tag drag-and-drop handler to every `RefLabel` rendered underneath. */
export function RefDropProvider({ repoPath, children }: { repoPath: string; children: ReactNode }) {
  const { handleDrop } = useRefDrop(repoPath)
  return <RefDropContext.Provider value={handleDrop}>{children}</RefDropContext.Provider>
}

/** The drop handler, or `null` outside a provider (e.g. lane-hint badges, tests) — drag disabled. */
export function useRefDropHandler(): RefDropHandler | null {
  return useContext(RefDropContext)
}
