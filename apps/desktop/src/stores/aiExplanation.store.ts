import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * What a remembered answer is about: a whole branch, a single commit, or the AI review of a branch.
 *
 * `branch` and `branch-review` share a ref but are different documents about it — the explanation
 * says what the branch does, the review says what is wrong with it — so they must not collide on the
 * same key. Reviews of the *working tree* are deliberately absent: like the working explanation, they
 * describe something that moves under them (see `useCodeReview`).
 */
export type ExplanationKind = 'branch' | 'commit' | 'branch-review'

/** One generated explanation, kept so reopening the panel is instant. */
export interface StoredExplanation {
  /** The markdown the model produced. */
  text: string
  /**
   * What it was read against — the base branch for a `branch` explanation, the parent commit for a
   * `commit` one. Shown in the panel, and what lets it warn that a remembered answer used a
   * different comparison than the current one.
   */
  comparedTo: string
  /** Epoch milliseconds when it was generated, so the panel can say how old it is. */
  generatedAt: number
}

interface AiExplanationState {
  /** Keyed by `<repoPath>::<kind>::<ref>` — see {@link explanationKey}. */
  explanations: Record<string, StoredExplanation>
  get: (repoPath: string, kind: ExplanationKind, ref: string) => StoredExplanation | undefined
  set: (
    repoPath: string,
    kind: ExplanationKind,
    ref: string,
    comparedTo: string,
    text: string
  ) => void
  clear: (repoPath: string, kind: ExplanationKind, ref: string) => void
  /** Drops every stored explanation — exposed for Settings/debug rather than used by the panels. */
  clearAll: () => void
}

/**
 * Key for one explanation. All three parts matter: the same branch name lives in many clones, and a
 * branch and a commit could otherwise collide (nothing stops a branch being named after a sha).
 * `::` cannot appear in a git ref name, so it can't collide with a path or a branch either.
 */
export function explanationKey(repoPath: string, kind: ExplanationKind, ref: string): string {
  return `${repoPath}::${kind}::${ref}`
}

/**
 * Remembers the AI explanations generated for branches and commits.
 *
 * Persisted, because these are expensive to produce (a local model, tens of seconds over a whole
 * diff) and cheap to keep — reopening something you looked at yesterday should show what you read
 * then, instantly, not spend another minute regenerating it. Nothing expires automatically: the
 * panel shows when it was generated and offers a regenerate button, which is a decision the user is
 * better placed to make than a timer.
 *
 * A commit's explanation is in principle valid forever (the commit is immutable); a branch's goes
 * stale as the branch moves — which is exactly why the age is always on screen.
 *
 * Holds only successful results. Transient state (streaming, error) lives in the hooks.
 */
export const useAiExplanationStore = create<AiExplanationState>()(
  persist(
    (set, get) => ({
      explanations: {},

      get: (repoPath, kind, ref) => get().explanations[explanationKey(repoPath, kind, ref)],

      set: (repoPath, kind, ref, comparedTo, text) =>
        set((state) => ({
          explanations: {
            ...state.explanations,
            [explanationKey(repoPath, kind, ref)]: { text, comparedTo, generatedAt: Date.now() },
          },
        })),

      clear: (repoPath, kind, ref) =>
        set((state) => {
          const key = explanationKey(repoPath, kind, ref)
          if (!state.explanations[key]) return state
          const next = { ...state.explanations }
          delete next[key]
          return { explanations: next }
        }),

      clearAll: () => set({ explanations: {} }),
    }),
    { name: 'git-manager-ai-explanations' }
  )
)
