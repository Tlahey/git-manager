import { create } from 'zustand'
import type { GithubApiResponse } from '../lib/tauri'
import {
  cooldownForResponse,
  cooldownMs,
  normalizeRateResource,
  rateLimitResourceForUrl,
  type GithubRateBucket,
  type GithubRateResource,
} from '../lib/githubRateLimit'

/**
 * How much of each connected account's GitHub quota is left, learned from the responses themselves.
 *
 * Fed by `api/github/githubApiShared.ts` — the single funnel every GitHub call goes through — from
 * the `x-ratelimit-*` headers Rust now surfaces (see `src-tauri/src/services/github_rate_limit.rs`).
 * The rules for what to *do* with the numbers live in `lib/githubRateLimit.ts`; this only remembers
 * them. It is the twin of `githubTokenStatus.store.ts`, fed from the same place for the same reason.
 *
 * # Deliberately not persisted
 *
 * A quota is a fact about the current hour. Reloading a spent bucket at launch would silence the
 * app's polling for a window that has long since reset, and the state is re-learned by the first
 * response anyway — the same argument that keeps the SSO verdict in memory.
 *
 * # Buckets are per account *and* per resource
 *
 * They are independent allowances at GitHub, so they are independent here: `search` is 30 requests a
 * minute and `core` is 5000 an hour, and letting a spent search budget stop the app from fetching a
 * diff would be a self-inflicted outage. See `lib/githubRateLimit.ts`.
 */
interface GithubRateLimitState {
  /** `accountId:resource` → what GitHub last said about that allowance. */
  buckets: Record<string, GithubRateBucket>
  /** Records one response's quota headers, and any cooldown they justify. */
  recordResponse: (
    accountId: string | null | undefined,
    url: string,
    res: GithubApiResponse
  ) => void
  /** Forgets an account — called when it is disconnected, so no stale cooldown outlives it. */
  forgetAccount: (accountId: string) => void
}

/** Anonymous requests have a quota too (60/hour by IP), and it is not any account's. */
export const ANONYMOUS_ACCOUNT = ''

export function bucketKey(
  accountId: string | null | undefined,
  resource: GithubRateResource
): string {
  return `${accountId ?? ANONYMOUS_ACCOUNT}:${resource}`
}

export const useGithubRateLimitStore = create<GithubRateLimitState>()((set, get) => ({
  buckets: {},

  recordResponse: (accountId, url, res) => {
    // Nothing to learn: no quota headers and no refusal to honour.
    if (!res.rateLimit && res.retryAfterSecs == null) return

    const now = Date.now()
    const resource = res.rateLimit
      ? normalizeRateResource(res.rateLimit.resource, url)
      : rateLimitResourceForUrl(url)
    const key = bucketKey(accountId, resource)
    const previous = get().buckets[key]
    const blockedUntil = cooldownForResponse(res, now)

    const next: GithubRateBucket = {
      limit: res.rateLimit?.limit ?? previous?.limit ?? 0,
      remaining: res.rateLimit?.remaining ?? previous?.remaining ?? 0,
      reset: res.rateLimit?.reset ?? previous?.reset ?? 0,
      // A cooldown already in force is not shortened by a later response: the response that set it
      // is the one that named the wait, and a subsequent 403 answering sooner must not be read as
      // permission to resume.
      blockedUntil:
        previous?.blockedUntil && blockedUntil
          ? Math.max(previous.blockedUntil, blockedUntil)
          : blockedUntil,
    }

    // A successful call is proof the cooldown is over, whatever the arithmetic said — this is what
    // makes a wait computed from a skewed clock self-correct instead of stranding the app.
    if (res.ok && next.remaining > 0) next.blockedUntil = null

    const unchanged =
      previous &&
      previous.limit === next.limit &&
      previous.remaining === next.remaining &&
      previous.reset === next.reset &&
      previous.blockedUntil === next.blockedUntil
    if (unchanged) return

    set((state) => ({ buckets: { ...state.buckets, [key]: next } }))
  },

  forgetAccount: (accountId) =>
    set((state) => {
      const next: Record<string, GithubRateBucket> = {}
      let removed = false
      for (const [key, bucket] of Object.entries(state.buckets)) {
        if (key.startsWith(`${accountId}:`)) removed = true
        else next[key] = bucket
      }
      return removed ? { buckets: next } : state
    }),
}))

/**
 * Milliseconds to wait before a request to this bucket may go out — `0` when it is free.
 *
 * A plain function rather than a hook because the check that matters happens in `ghRequest`, outside
 * React: the point is that a request never leaves while GitHub is refusing them.
 */
export function githubCooldownMs(
  accountId: string | null | undefined,
  resource: GithubRateResource
): number {
  return cooldownMs(
    useGithubRateLimitStore.getState().buckets[bucketKey(accountId, resource)],
    Date.now()
  )
}
