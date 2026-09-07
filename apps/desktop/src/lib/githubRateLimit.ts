/**
 * The rules for spending the GitHub quota, as pure functions.
 *
 * `stores/githubRateLimit.store.ts` holds what GitHub last said; this decides what to do about it.
 * Kept apart because every rule here is a judgement call worth testing on its own — which bucket a
 * URL is billed to, when to stop asking, how much to slow a poll down — and none of them needs a
 * store, a token or a React render to be checked.
 */

/**
 * Which of GitHub's independent allowances a request is billed to.
 *
 * Only the three the app can actually reach. `search` is the one worth naming separately: it is
 * 30 requests a *minute* against `core`'s 5000 an hour, so a handful of saved PR filters can exhaust
 * it while `core` is barely touched — and blocking diffs because the filters ran would be a bug.
 */
export type GithubRateResource = 'core' | 'search' | 'graphql'

/**
 * The bucket a URL will be billed to, decided before the request goes out.
 *
 * Known ahead of time because the throttle has to run *before* spending anything; GitHub's own
 * `x-ratelimit-resource` only arrives with the answer. The two agree by construction — every
 * `search/…` path is billed to `search`, `/graphql` to `graphql` — and the response's own value is
 * what the store records, so a disagreement corrects itself on the next call rather than persisting.
 */
export function rateLimitResourceForUrl(url: string): GithubRateResource {
  if (url.startsWith('https://api.github.com/graphql')) return 'graphql'
  if (url.startsWith('https://api.github.com/search/')) return 'search'
  return 'core'
}

/**
 * GitHub's own `x-ratelimit-resource`, narrowed to a bucket the app models — falling back to what
 * the URL implies for the ones it does not (`integration_manifest`, `code_search`, `dependency_
 * snapshots`…).
 *
 * Filing an unmodelled resource under the URL's bucket rather than inventing a key for it keeps the
 * throttle honest in the direction that matters: it will slow `core` down on the strength of a
 * neighbouring allowance, which costs a little speed, instead of tracking a bucket nothing ever
 * consults and letting the real one run to zero unnoticed.
 */
export function normalizeRateResource(reported: string, url: string): GithubRateResource {
  if (reported === 'core' || reported === 'search' || reported === 'graphql') return reported
  return rateLimitResourceForUrl(url)
}

/** What GitHub last said about one allowance, plus any cooldown the app imposed on itself. */
export interface GithubRateBucket {
  limit: number
  remaining: number
  /** Unix epoch **seconds**, as GitHub sends it. */
  reset: number
  /**
   * Epoch **milliseconds** until which no request should be sent, or `null` when free.
   *
   * Set either because the allowance is spent (wait for `reset`) or because GitHub answered a
   * secondary rate limit with a `Retry-After` — a separate mechanism from the hourly quota, and the
   * one GitHub explicitly documents as "wait this long before retrying".
   */
  blockedUntil: number | null
}

/**
 * Longest self-imposed cooldown, whatever the numbers say.
 *
 * `reset` is a timestamp from GitHub's clock compared against the local one, and the two can
 * disagree by more than a little on a machine whose time is off. An hour is the longest window any
 * bucket actually has, so a wait longer than that is a symptom of skew rather than of a real quota —
 * and the cost of capping it wrong is one request that comes back with the true numbers.
 */
export const MAX_COOLDOWN_MS = 60 * 60 * 1000

/** Milliseconds to wait before this bucket may be used again — `0` when it is free right now. */
export function cooldownMs(bucket: GithubRateBucket | undefined, now: number): number {
  if (!bucket?.blockedUntil) return 0
  return Math.min(Math.max(0, bucket.blockedUntil - now), MAX_COOLDOWN_MS)
}

/**
 * The cooldown a response justifies, or `null` to leave the bucket alone.
 *
 * Two distinct refusals, and conflating them would get one of them wrong:
 *
 * * A `Retry-After` is GitHub naming a duration — a *secondary* rate limit, triggered by making too
 *   many requests too quickly rather than by exhausting the hourly allowance. It is honoured
 *   verbatim, because ignoring it is what escalates a secondary limit into a longer one.
 * * A spent allowance (`remaining` at zero) is honoured until `reset`, because every request until
 *   then is a guaranteed 403 — and a 403 is what several callers turn into an empty list, so
 *   spending them means showing "you have no pull requests" over and over.
 *
 * A bucket with requests left imposes nothing: slowing down before the wall is the *poller's* job
 * (see {@link throttledInterval}), not a reason to refuse a merge the user just clicked.
 */
export function cooldownForResponse(
  res: { retryAfterSecs: number | null; rateLimit: { remaining: number; reset: number } | null },
  now: number
): number | null {
  if (res.retryAfterSecs != null) {
    return now + Math.min(res.retryAfterSecs * 1000, MAX_COOLDOWN_MS)
  }
  if (res.rateLimit?.remaining === 0) {
    return now + Math.min(Math.max(0, res.rateLimit.reset * 1000 - now), MAX_COOLDOWN_MS)
  }
  return null
}

/**
 * How much of a bucket is left, as a fraction, or `null` when GitHub has not been heard from.
 *
 * `null` is not "full": a bucket nobody has spent from yet and a bucket whose state is unknown lead
 * to the same behaviour here (poll normally), but only one of them is worth showing a user.
 */
export function remainingFraction(bucket: GithubRateBucket | undefined): number | null {
  if (!bucket || bucket.limit <= 0) return null
  return bucket.remaining / bucket.limit
}

/**
 * A poll interval slowed down in proportion to how little quota is left — `0` meaning "do not poll
 * at all", which is what SWR's `refreshInterval` reads as off.
 *
 * The app's polling is what spends the quota (a PR list every minute, an open PR's details every
 * thirty seconds, one search per saved filter), so it is what has to give way. Backing off in steps
 * rather than at a single threshold is deliberate: a cliff would let the app run at full speed until
 * it stopped dead, which is exactly the failure this exists to avoid. At a quarter left it polls
 * half as often, at a tenth four times less, and once the bucket is blocked it stops — by which
 * point the request would be refused anyway, so the only thing continuing would buy is a log line.
 */
export function throttledInterval(
  baseMs: number,
  bucket: GithubRateBucket | undefined,
  now: number
): number {
  if (cooldownMs(bucket, now) > 0) return 0
  const fraction = remainingFraction(bucket)
  if (fraction === null || fraction > 0.5) return baseMs
  if (fraction > 0.25) return baseMs * 2
  if (fraction > 0.1) return baseMs * 4
  return baseMs * 8
}
