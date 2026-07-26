import { create } from 'zustand'

/** One in-flight generation. `featureId` is the `AiFeature.id` from `@git-manager/ai`
 * (`commit-message`, `pr-description`, …), which the footer maps to a human label. */
export interface AiRun {
  runId: number
  featureId: string
  /** Epoch ms the run started — the footer uses it to pick the newest when several overlap. */
  startedAt: number
}

interface AiActivityState {
  /** Every generation currently running, oldest first. Empty when the model is idle. */
  runs: AiRun[]
  /** Registers a starting generation; returns the id to hand back to {@link end}. */
  begin: (featureId: string) => number
  /** Clears a finished generation — whether it succeeded, failed or was cancelled. */
  end: (runId: number) => void
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

  begin: (featureId) => {
    const runId = ++nextRunId
    set((s) => ({ runs: [...s.runs, { runId, featureId, startedAt: Date.now() }] }))
    return runId
  },

  end: (runId) => set((s) => ({ runs: s.runs.filter((r) => r.runId !== runId) })),
}))

/** Brackets one generation with the store's begin/end. Always ends — a rejected provider call must
 * not leave the footer spinning forever, which is the failure mode this helper exists to prevent. */
export async function withAiActivity<T>(featureId: string, run: () => Promise<T>): Promise<T> {
  const { begin, end } = useAiActivityStore.getState()
  const runId = begin(featureId)
  try {
    return await run()
  } finally {
    end(runId)
  }
}
