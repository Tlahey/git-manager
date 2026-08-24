import { useEffect, type ReactNode } from 'react'
import { useRefDrop, type RefDropActionId } from '../hooks/useRefDrop'
import { RefDropContext } from '../hooks/useRefDropHandler'
import type { GitRef } from '@git-manager/git-types'

/** Provides the branch/tag drag-and-drop handler to every `RefLabel` rendered underneath. */
export function RefDropProvider({ repoPath, children }: { repoPath: string; children: ReactNode }) {
  const { handleDrop, runRefDropAction } = useRefDrop(repoPath)

  // e2e-only bridge: the drop menu is a real native OS menu, unclickable by WebDriver (same
  // problem `__e2eRepoUIStore`'s `pendingGraphAction` solves for other native-menu-only flows —
  // see main.tsx). Rather than faking a menu click, this lets a step call the exact action a real
  // click would have, against caller-supplied `GitRef`s (the e2e suite builds these from real git
  // data — see ref-drop.steps.ts — rather than resolving them from the live store).
  useEffect(() => {
    if (import.meta.env.VITE_E2E !== 'true') return
    ;(
      window as unknown as {
        __e2eRefDropActions?: {
          run: (actionId: RefDropActionId, source: GitRef, target: GitRef) => void
        }
      }
    ).__e2eRefDropActions = { run: runRefDropAction }
  }, [runRefDropAction])

  return <RefDropContext.Provider value={handleDrop}>{children}</RefDropContext.Provider>
}
