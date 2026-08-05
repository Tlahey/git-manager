import { createContext, useContext } from 'react'
import type { GitRef } from '@git-manager/git-types'

/** Drop handler shared with the deep `RefLabel` badges so they don't need the graph's props. */
export type RefDropHandler = (source: GitRef, target: GitRef) => void

// The context object and its reader live here rather than in `RefDropContext.tsx` so that file
// exports its provider component alone — a module mixing a component with a hook loses Vite's
// Fast Refresh (`react/only-export-components`).
export const RefDropContext = createContext<RefDropHandler | null>(null)

/** The drop handler, or `null` outside a provider (e.g. lane-hint badges, tests) — drag disabled. */
export function useRefDropHandler(): RefDropHandler | null {
  return useContext(RefDropContext)
}
