import { create } from 'zustand'

/**
 * Ref-counted "the app is busy loading something" state, driving the full-screen
 * {@link LoadingOverlay} (dark scrim + animated mascot). Any operation that makes
 * the user wait — most notably switching to a repo whose data isn't cached yet —
 * calls `begin()` and holds the returned token until it `end()`s it.
 *
 * Ref-counting (rather than a single boolean) lets concurrent operations overlap
 * without one clearing another's overlay. Client-side UI state only — not persisted.
 */

let nextToken = 0

interface GlobalLoadingState {
  /** token → caption. One entry per in-flight loading operation. */
  active: Record<number, string>
  /** Register a loading operation; returns a token to pass back to `end()`. */
  begin: (label?: string) => number
  /** Clear a previously-registered loading operation. */
  end: (token: number) => void
}

export const useGlobalLoadingStore = create<GlobalLoadingState>((set) => ({
  active: {},
  begin: (label = '') => {
    const token = ++nextToken
    set((state) => ({ active: { ...state.active, [token]: label } }))
    return token
  },
  end: (token) =>
    set((state) => {
      if (!(token in state.active)) return state
      const next = { ...state.active }
      delete next[token]
      return { active: next }
    }),
}))

/** Whether any loading operation is currently in flight. */
export function selectIsGlobalLoading(state: GlobalLoadingState): boolean {
  return Object.keys(state.active).length > 0
}

/** Caption of the most recently started operation, for the overlay (empty if idle). */
export function selectGlobalLoadingLabel(state: GlobalLoadingState): string {
  const tokens = Object.keys(state.active)
  if (tokens.length === 0) return ''
  const latest = Math.max(...tokens.map(Number))
  return state.active[latest] ?? ''
}
