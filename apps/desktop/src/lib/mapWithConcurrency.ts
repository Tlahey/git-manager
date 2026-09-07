/**
 * `Promise.all` with a ceiling on how many run at once.
 *
 * Written for the dashboard's pull-request enrichment, which used a bare `Promise.all` over every
 * open pull request and so opened three requests per PR *simultaneously* — seventy-five in flight,
 * once a minute, from one token. GitHub asks for the opposite in as many words: "make requests for a
 * single user serially rather than concurrently", and its secondary rate limits are triggered by
 * exactly that burst shape, independently of the hourly quota. A burst that is *free* under the
 * conditional-request cache is still a burst.
 *
 * Order is preserved and the shape is `Promise.all`'s, so a caller swaps one for the other and
 * changes nothing else. A rejection propagates, likewise — callers that want best-effort catch
 * inside `fn`, as they would have anyway.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const results: R[] = Array.from({ length: items.length })
  // A shared cursor rather than fixed slices per worker: the tasks are network calls of wildly
  // different durations, and slicing would leave a worker idle behind one slow pull request while
  // its share of the queue waited.
  let cursor = 0

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker))
  return results
}
