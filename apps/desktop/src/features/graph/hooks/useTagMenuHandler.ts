import { createContext, useContext } from 'react'
import type { MouseEvent } from 'react'
import type { GitRef } from '@git-manager/git-types'

/** Tag context-menu handler shared with the deep `RefLabel` badges so they don't need graph props. */
export type TagMenuHandler = (e: MouseEvent, gitRef: GitRef) => void

// The context object and its reader live here rather than in `TagMenuContext.tsx` so that file
// exports its provider component alone — a module mixing a component with a hook loses Vite's
// Fast Refresh (`react/only-export-components`).
export const TagMenuContext = createContext<TagMenuHandler | null>(null)

/** The tag-menu handler, or `null` outside a provider (e.g. lane-hint badges, tests). */
export function useTagMenuHandler(): TagMenuHandler | null {
  return useContext(TagMenuContext)
}
