import type { ReactNode } from 'react'
import { useRefDrop } from '../hooks/useRefDrop'
import { RefDropContext } from '../hooks/useRefDropHandler'

/** Provides the branch/tag drag-and-drop handler to every `RefLabel` rendered underneath. */
export function RefDropProvider({ repoPath, children }: { repoPath: string; children: ReactNode }) {
  const { handleDrop } = useRefDrop(repoPath)
  return <RefDropContext.Provider value={handleDrop}>{children}</RefDropContext.Provider>
}
