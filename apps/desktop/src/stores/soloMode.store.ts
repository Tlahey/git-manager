import { create } from 'zustand'

/**
 * Solo-mode state for the graph's branch-visibility filter ("Hiding & Soloing"). When `active`,
 * the graph loads only the commits reachable from the soloed branches — every other branch is
 * fully hidden (the filtering happens in Rust's `get_log` revwalk, not by dimming rows). Branches
 * are keyed by their `shortName` ("main" for local, "origin/feat" for remote), the exact string
 * the Rust ref resolver accepts.
 *
 * Client-side UI state only, not persisted; cleared when the active repo changes (see
 * `GitGraph.tsx`, next to the author-filter reset — mirrors `useGraphAuthorFilterStore`).
 */
interface SoloModeState {
  /** Whether solo mode is engaged. */
  active: boolean
  /** Branch shortNames kept visible in the graph. */
  soloed: Set<string>
  /**
   * Turn solo mode on, seeding the soloed set with `initial` (dropping blanks/dupes) so the graph
   * is never empty on entry — "everything hidden except the branch we solo".
   */
  enable: (initial?: (string | null | undefined)[]) => void
  /** Turn solo mode off, keeping the soloed set as-is (re-enabling restores it). */
  disable: () => void
  /** Add the branch if absent, remove it if already soloed. */
  toggle: (shortName: string) => void
  /** Turn off and empty the soloed set ("Clear solo"). */
  clear: () => void
}

export const useSoloModeStore = create<SoloModeState>((set) => ({
  active: false,
  soloed: new Set<string>(),
  enable: (initial) =>
    set(() => ({
      active: true,
      soloed: new Set((initial ?? []).filter((n): n is string => !!n && n.trim().length > 0)),
    })),
  disable: () => set((state) => (state.active ? { active: false } : state)),
  toggle: (shortName) =>
    set((state) => {
      const next = new Set(state.soloed)
      if (next.has(shortName)) next.delete(shortName)
      else next.add(shortName)
      return { soloed: next }
    }),
  clear: () =>
    set((state) =>
      !state.active && state.soloed.size === 0
        ? state
        : { active: false, soloed: new Set<string>() }
    ),
}))
