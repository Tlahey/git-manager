import { useE2eCrashStore } from '../../stores/e2eCrash.store'

/**
 * Renders nothing until an e2e scenario flips `useE2eCrashStore`'s flag (via the
 * `window.__e2eCrashStore` bridge `main.tsx` exposes), then throws during render so
 * `AppErrorBoundary` catches it — the only way a scenario can deliberately reach the crash
 * screen's own `ErrorReportDialog` mount (see git-manager#439).
 */
export function E2ECrashTrigger() {
  const shouldCrash = useE2eCrashStore((s) => s.shouldCrash)
  if (shouldCrash) {
    throw new Error('E2E-triggered crash (window.__e2eCrashStore.trigger())')
  }
  return null
}
