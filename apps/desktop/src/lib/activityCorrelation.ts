/**
 * Correlation context for the activity log. A user action (a pull, a commit, a rebase…) usually
 * fans out into several backend IPC calls; wrapping that action in `runActivity` tags every
 * `invoke` it issues with the same `correlationId`, so the Activity Logs view can group them into a
 * single readable block (see `stores/activityLog.store.ts` and `lib/groupActivityLog.ts`).
 *
 * Limitation: the browser has no `AsyncLocalStorage`, so the active correlation is a module-level
 * value read synchronously at the start of each `invoke`. This is exact for the common case (one
 * user action whose IPC calls run in sequence), but two genuinely interleaved user actions could
 * cross-attribute — acceptable on a single-user desktop git client where that essentially never
 * happens. Calls issued outside any `runActivity` simply carry no correlation and render as their
 * own singleton block.
 */

export interface ActivityCorrelation {
  id: string
  label: string
}

let activeCorrelation: ActivityCorrelation | null = null
let seq = 0

/** The correlation currently in scope, captured by the `invoke` wrapper. */
export function getActiveCorrelation(): ActivityCorrelation | null {
  return activeCorrelation
}

/**
 * Run `fn` as a single correlated user action labelled `label`. Every `invoke` issued while `fn`
 * is on the stack shares one fresh correlation id. Nesting is supported: the previous correlation
 * is restored when `fn` settles, so an outer action's later calls keep their own id.
 */
export async function runActivity<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const previous = activeCorrelation
  activeCorrelation = { id: `corr-${Date.now()}-${seq++}`, label }
  try {
    return await fn()
  } finally {
    activeCorrelation = previous
  }
}
