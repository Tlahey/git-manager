import type { Dispatch, SetStateAction } from 'react'
import { create } from 'zustand'
import type { AiPanelTarget } from './repoUI.store'

/**
 * Where a generation was started from, so the footer can take the user back to it.
 *
 * Captured when the run begins rather than declared by each feature: at that instant the panel the
 * user just clicked in is the one that is open, so the UI state *is* the answer. That also means a
 * run keeps its origin after the user navigates away — which is exactly when being able to return
 * matters.
 */
export interface AiRunOrigin {
  /** The repository tab the run belongs to. */
  repoPath: string
  /** The right-hand panel that was open, when the run came from one. */
  panel?: AiPanelTarget
}

/** One in-flight generation. `featureId` is the `AiFeature.id` from `@git-manager/ai`
 * (`commit-message`, `pr-description`, …), which the footer maps to a human label. */
export interface AiRun {
  runId: number
  featureId: string
  /** Epoch ms the run started — the footer uses it to pick the newest when several overlap. */
  startedAt: number
  /** Where to go to watch it. Absent for a run with nowhere to return to (a background summary). */
  origin?: AiRunOrigin
}

/**
 * How far a map phase has got, and which feature's phase it is.
 *
 * Tagged with the feature because a map phase is *many* runs — one `AiRun` per call, each beginning
 * and ending — so the count cannot live on a run without dying with it. The tag is what keeps a
 * finished phase's last count from being displayed against the next, unrelated generation: the
 * footer shows it only while the running feature is the one it belongs to.
 */
export interface AiPhaseProgress {
  /** `AiFeature.id` of the calls being counted (`file-summary`, `commit-relevance`). */
  featureId: string
  completed: number
  total: number
}

interface AiActivityState {
  /** Every generation currently running, oldest first. Empty when the model is idle. */
  runs: AiRun[]
  /** The map phase's count, when one is driving the current work. */
  progress: AiPhaseProgress | null
  /** Registers a starting generation; returns the id to hand back to {@link end}. */
  begin: (featureId: string, origin?: AiRunOrigin) => number
  /** Clears a finished generation — whether it succeeded, failed or was cancelled. */
  end: (runId: number) => void
  /** Publishes the map phase's count. See {@link trackAiProgress} for the usual caller. */
  setProgress: (progress: AiPhaseProgress) => void
}

let nextRunId = 0

/**
 * Which AI generations are in flight right now, so the app can say "the model is working" somewhere
 * other than the component that asked.
 *
 * Populated from the api layer's transport wrapper rather than from each feature's hook: every
 * feature already funnels through `runStream`/`runComplete`, so one bracket there covers all of them
 * and a future feature is instrumented for free. It is a *list*, not a boolean, because nothing
 * stops two features generating at once — see the "one global generation slot" limitation in
 * `docs/ai/README.md`; a counter would make the footer lie about which one is left
 * running when one of the two finishes.
 */
export const useAiActivityStore = create<AiActivityState>((set) => ({
  runs: [],
  progress: null,

  begin: (featureId, origin) => {
    const runId = ++nextRunId
    set((s) => ({ runs: [...s.runs, { runId, featureId, startedAt: Date.now(), origin }] }))
    return runId
  },

  end: (runId) => set((s) => ({ runs: s.runs.filter((r) => r.runId !== runId) })),

  // Deliberately not cleared when the runs empty: a sequential map phase leaves the list empty
  // between two calls, so clearing there would blank the count for most of the run. The feature tag
  // is what makes a leftover harmless instead.
  setProgress: (progress) => set({ progress }),
}))

/**
 * Wraps a map phase's `onProgress` so the footer counts the same steps the panel does.
 *
 * Takes the feature id explicitly rather than reading whichever run happens to be in flight: the
 * count is published *between* calls, when nothing is in flight at all, so there would be nothing to
 * read. The caller knows which feature its phase runs — that is the whole point of it having one.
 */
export function trackAiProgress<P extends { completed: number; total: number }>(
  featureId: string,
  local: Dispatch<SetStateAction<P | null>>
): (progress: P) => void {
  return (progress) => {
    useAiActivityStore
      .getState()
      .setProgress({ featureId, completed: progress.completed, total: progress.total })
    local(progress)
  }
}

/** Brackets one generation with the store's begin/end. Always ends — a rejected provider call must
 * not leave the footer spinning forever, which is the failure mode this helper exists to prevent. */
export async function withAiActivity<T>(
  featureId: string,
  run: () => Promise<T>,
  origin?: AiRunOrigin
): Promise<T> {
  const { begin, end } = useAiActivityStore.getState()
  const runId = begin(featureId, origin)
  try {
    return await run()
  } finally {
    end(runId)
  }
}
