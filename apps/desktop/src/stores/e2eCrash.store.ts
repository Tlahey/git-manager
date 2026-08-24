import { create } from 'zustand'

interface E2eCrashState {
  shouldCrash: boolean
  /** Flips the flag `E2ECrashTrigger` reads during render, so it throws on its next render. */
  trigger: () => void
}

/**
 * Backs `E2ECrashTrigger` — the one e2e-only way to reach `AppErrorBoundary`'s fallback from a
 * scenario. Neither the `DEBUG_ACTIONS` registry (scoped to notifications/notch/transfers/AI runs)
 * nor the `window.__e2eXStore` bridge family (which reads live state, not force a component to
 * throw) fit this — see git-manager#439. Not persisted: it only ever needs to hold one flag for the
 * lifetime of the current document.
 */
export const useE2eCrashStore = create<E2eCrashState>((set) => ({
  shouldCrash: false,
  trigger: () => set({ shouldCrash: true }),
}))
