import { create } from 'zustand'
import type { HookProgressEvent } from '../api/hookProgress.api'

/**
 * Which repository hook is running right now, per repository.
 *
 * One at a time is not an assumption, it is how git works: a commit runs `pre-commit`, then
 * `commit-msg`, then `post-commit`, strictly in sequence, and the app runs exactly one operation
 * per repository at a time. So a repository has at most one hook in flight, and the second one
 * starting is the first one's replacement rather than a second entry.
 *
 * Deliberately *not* a record of what hooks did — that is `AppError::HookFailed`'s job, which
 * carries the output the user actually needs. This store only knows "something is running", which
 * is the one thing nothing could tell the user before.
 */
export interface RunningHook {
  repoPath: string
  /** `pre-commit`, `commit-msg`, `pre-push`, … */
  name: string
  /** When it started, for a card that wants to show how long this is taking. */
  startedAt: number
}

interface HookProgressState {
  /** Keyed by repository path. */
  running: Record<string, RunningHook>
  report: (event: HookProgressEvent) => void
  /** Drops a repository's entry — for a caller that knows the operation is over. */
  clear: (repoPath: string) => void
}

export const useHookProgressStore = create<HookProgressState>((set) => ({
  running: {},

  report: (event) =>
    set((state) => {
      if (event.phase === 'started') {
        return {
          running: {
            ...state.running,
            [event.repoPath]: {
              repoPath: event.repoPath,
              name: event.name,
              startedAt: Date.now(),
            },
          },
        }
      }

      // A `finished` for a hook this store is no longer showing is not an error worth guarding
      // against loudly, but it must not clear whatever *is* running: `post-commit` finishing after
      // `pre-commit` was replaced by it would otherwise wipe the wrong entry.
      const current = state.running[event.repoPath]
      if (!current || current.name !== event.name) return state

      const { [event.repoPath]: _gone, ...rest } = state.running
      return { running: rest }
    }),

  clear: (repoPath) =>
    set((state) => {
      if (!state.running[repoPath]) return state
      const { [repoPath]: _gone, ...rest } = state.running
      return { running: rest }
    }),
}))
