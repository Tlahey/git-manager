import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Remembers the AI explanation generated for each action in the "Behind the scenes" journal.
 *
 * Persisted, for the reason every AI result in this app is: a local model spends real seconds on one,
 * and an action is *immutable* — it already happened, and the commands it ran will never change — so
 * a remembered explanation stays correct indefinitely. Reopening the window should show what you read
 * yesterday, instantly.
 *
 * Separate from `aiExplanation.store` rather than a fourth `ExplanationKind` there: that store keys on
 * `repoPath::kind::ref` because a branch or a commit only means something inside a repository, while an
 * action's identity is its activity-log correlation id, which is globally unique and may not belong to
 * any repository at all (a clone has no repo yet). Bending one key shape to cover both would have
 * meant a fake repoPath for half the entries.
 */

/** One generated explanation of one action. */
export interface StoredActionExplanation {
  /** The markdown the model produced. */
  text: string
  /** Epoch milliseconds when it was generated, so the panel can say how old it is. */
  generatedAt: number
}

/**
 * Cap on remembered explanations, evicting the oldest.
 *
 * The journal shows fifty actions but the activity log is a week deep, so browsing back through it
 * across several days would otherwise grow this store without bound — and it lives in
 * `localStorage`, where an unbounded string is a real failure and not just waste. Four times the
 * pool: generous enough that nothing you are still looking at gets evicted.
 */
const MAX_REMEMBERED = 200

interface ActionExplanationState {
  /** Keyed by the action's id (its activity-log correlation id, or a lone entry's id). */
  explanations: Record<string, StoredActionExplanation>
  get: (actionId: string) => StoredActionExplanation | undefined
  set: (actionId: string, text: string) => void
  clear: (actionId: string) => void
  /** Drops every remembered explanation — the journal's "forget all" affordance. */
  clearAll: () => void
}

/** The map with its oldest entries dropped, once it is over the cap. */
function evictOldest(
  explanations: Record<string, StoredActionExplanation>
): Record<string, StoredActionExplanation> {
  const keys = Object.keys(explanations)
  if (keys.length <= MAX_REMEMBERED) return explanations
  const kept = keys
    .sort((a, b) => explanations[b].generatedAt - explanations[a].generatedAt)
    .slice(0, MAX_REMEMBERED)
  return Object.fromEntries(kept.map((key) => [key, explanations[key]]))
}

export const useActionExplanationStore = create<ActionExplanationState>()(
  persist(
    (set, get) => ({
      explanations: {},

      get: (actionId) => get().explanations[actionId],

      set: (actionId, text) =>
        set((state) => ({
          explanations: evictOldest({
            ...state.explanations,
            [actionId]: { text, generatedAt: Date.now() },
          }),
        })),

      clear: (actionId) =>
        set((state) => {
          if (!state.explanations[actionId]) return state
          const next = { ...state.explanations }
          delete next[actionId]
          return { explanations: next }
        }),

      clearAll: () => set({ explanations: {} }),
    }),
    { name: 'git-manager-action-explanations' }
  )
)
