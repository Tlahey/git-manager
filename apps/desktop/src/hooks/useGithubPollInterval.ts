import { useEffect, useState } from 'react'
import {
  cooldownMs,
  throttledInterval,
  MAX_COOLDOWN_MS,
  type GithubRateResource,
} from '../lib/githubRateLimit'
import { bucketKey, useGithubRateLimitStore } from '../stores/githubRateLimit.store'

/**
 * An SWR `refreshInterval` that gives way as the GitHub quota runs down, and stops at zero.
 *
 * Every GitHub hook that polls goes through this instead of hard-coding its own number. The polling
 * is what spends the quota — a pull-request list a minute, an open PR's details every thirty
 * seconds, one search per saved filter — so it is what has to slow down; the rules live in
 * `lib/githubRateLimit.ts` and the readings in `stores/githubRateLimit.store.ts`.
 *
 * The `baseMs` a caller passes is still the interval it gets whenever the quota is comfortable,
 * which is nearly always. Nothing here makes a healthy session poll less often.
 *
 * # Naming every bucket a hook spends from
 *
 * `resource` takes a list because one refresh is not always one kind of call: the dashboard's does a
 * `search`, then a `core` request per pull request, then a `graphql` one. The most constrained of
 * them decides — a hook whose *first* call would be refused has nothing to gain from firing.
 *
 * # Both selectors return a number on purpose
 *
 * This hook is mounted by everything that polls, and the store it reads changes on *every* GitHub
 * response (`remaining` counts down). A selector returning the bucket objects would therefore
 * re-render all of them dozens of times a minute for numbers none of them display. Returning the
 * derived scalars means a re-render only when the interval actually crosses a threshold.
 */
export function useGithubPollInterval(
  baseMs: number,
  accountId: string | null | undefined,
  resource: GithubRateResource | GithubRateResource[] = 'core'
): number {
  const resources = Array.isArray(resource) ? resource : [resource]

  // The end of a cooldown is a moment, not an event: nothing writes to the store when it passes, so
  // without a timer the interval would stay at zero until some unrelated response happened to
  // arrive — which, with every poller stopped, could be never.
  const blockedUntil = useGithubRateLimitStore((s) =>
    resources.reduce<number | null>((latest, r) => {
      const blocked = s.buckets[bucketKey(accountId, r)]?.blockedUntil
      return blocked ? Math.max(latest ?? 0, blocked) : latest
    }, null)
  )
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!blockedUntil) return
    // The extra beat lands the timer *after* the cooldown rather than exactly on it, where a
    // millisecond of rounding would mean re-arming for another full wait.
    const delay = Math.min(Math.max(0, blockedUntil - Date.now()), MAX_COOLDOWN_MS) + 250
    const timer = setTimeout(() => setTick((t) => t + 1), delay)
    return () => clearTimeout(timer)
  }, [blockedUntil])

  return useGithubRateLimitStore((s) => {
    const now = Date.now()
    let interval = baseMs
    for (const r of resources) {
      const bucket = s.buckets[bucketKey(accountId, r)]
      if (cooldownMs(bucket, now) > 0) return 0
      interval = Math.max(interval, throttledInterval(baseMs, bucket, now))
    }
    return interval
  })
}
