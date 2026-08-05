/**
 * How many model calls a map phase may have in flight at once, by default.
 *
 * **One**, deliberately. Whether concurrency helps at all is a property of the *server*, not of this
 * code: a provider that serialises — which is Ollama's default, one generation at a time per model
 * unless `OLLAMA_NUM_PARALLEL` says otherwise — gains nothing from a second request and only loses
 * the ability to cancel it. So the shipped default reproduces exactly the behaviour this app had
 * before the pool existed, and raising it is a decision the user makes about their own server.
 */
export const DEFAULT_AI_CONCURRENCY = 1

/**
 * Ceiling on {@link DEFAULT_AI_CONCURRENCY}'s setting.
 *
 * Not a technical limit — a limit on how wrong the number can be. Servers that batch expose their own
 * admission limit (omlx's "max concurrent requests" defaults to 8) and going past it only queues the
 * surplus at the socket, where it is invisible and still counts against the request timeout. Measured
 * returns also flatten well before here: on an MLX-served MoE, 8 in flight bought 2.0x against 1.8x
 * at 4, while the slowest single request went from 2.5s to 7.8s.
 */
export const MAX_AI_CONCURRENCY = 16

export interface MapConcurrentlyOptions<R> {
  /**
   * Called as each item settles, with the index it settled at.
   *
   * The index matters as soon as `concurrency` is above 1: results come back in completion order,
   * which is not input order, so a caller that appends them would show a scrambled list. The index is
   * what lets it place them instead.
   */
  onSettled?(result: R, index: number): void
  /** Polled before each item is dispatched. Stops handing out new work; see {@link mapConcurrently}. */
  shouldStop?(): boolean
}

export interface MapConcurrentlyOutcome<R> {
  /** Everything that settled, in **input** order, with unstarted items simply absent. */
  results: R[]
  /** True when {@link MapConcurrentlyOptions.shouldStop} ended the run early. */
  stopped: boolean
}

/**
 * Runs `run` over `items` with at most `concurrency` in flight, preserving input order in the result.
 *
 * The shared engine of both map phases — `summarizeFiles` over a changeset's files, `scanCommits`
 * over history's commits. Both used to be a plain `for` loop, on the reasoning that a local provider
 * holds one copy of the weights so concurrent requests would queue behind them anyway. That is true
 * of some servers and false of others: one that does **continuous batching** folds several requests
 * into the same forward pass, and the throughput difference is large enough to be worth a knob.
 * Measured against an MLX server with 8-way admission, 8 requests of one commit's diff each:
 *
 * | in flight | total | per request |
 * | --------- | ----- | ----------- |
 * | 1         | 15.8s | 2.0s        |
 * | 4         |  8.9s | 4.4s        |
 * | 8         |  7.8s | 7.6s        |
 *
 * The shape of that table is the thing to understand before raising the setting: **the total falls
 * because each request gets slower, not faster**. Batching trades latency for throughput, so the per
 * request column is what the request timeout has to absorb — a 3x tail on a scan whose calls already
 * take twenty seconds is the difference between a budget that fits and a wall of timeouts.
 *
 * ### Cancellation gets coarser, and that is the real cost
 *
 * `shouldStop` is polled before *dispatching*, never during a call: the completion transport takes no
 * request id, so anything already sent finishes and its answer is thrown away. At concurrency 1 that
 * wastes one call. At 8 it wastes 8. Nothing here can fix that — it is a property of the transport —
 * so the honest framing is that the setting buys throughput with cancellation latency.
 *
 * `run` is expected to absorb its own failures (both callers turn one into a recorded, marked
 * result); if it does reject, every in-flight call is awaited first and the rejection is rethrown,
 * so a failure never leaves work running against a run the caller believes is over.
 */
export async function mapConcurrently<T, R>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<R>,
  options: MapConcurrentlyOptions<R> = {}
): Promise<MapConcurrentlyOutcome<R>> {
  const { onSettled, shouldStop } = options

  const slots = Array.from<R | undefined>({ length: items.length })
  const settled = Array.from({ length: items.length }, () => false)
  // Clamped here rather than trusted from the caller: the number arrives from persisted settings,
  // and a hand-edited one asking for five hundred in flight would open five hundred sockets.
  const width = Math.max(
    1,
    Math.min(Math.trunc(concurrency) || 1, MAX_AI_CONCURRENCY, items.length)
  )

  let next = 0
  let stopped = false

  const worker = async (): Promise<void> => {
    for (;;) {
      if (shouldStop?.()) {
        stopped = true
        return
      }
      const index = next++
      if (index >= items.length) return

      const result = await run(items[index], index)
      slots[index] = result
      settled[index] = true
      onSettled?.(result, index)
    }
  }

  // allSettled rather than all: a rejecting worker must not let the run be considered over while its
  // siblings are still talking to the provider.
  const outcomes = await Promise.allSettled(Array.from({ length: width }, worker))
  const failure = outcomes.find((o) => o.status === 'rejected')
  if (failure) throw failure.reason

  const results: R[] = []
  for (let i = 0; i < items.length; i++) if (settled[i]) results.push(slots[i]!)
  return { results, stopped }
}
