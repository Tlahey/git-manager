import type { MockPR } from '../../lib/github/types'
import { mapWithConcurrency } from '../../lib/mapWithConcurrency'
import { resolveCiStatus } from '../../lib/ciStatus'
import { fetchGitHubCommitCiStatus } from './github-checks.api'
import {
  fetchGitHubPRs,
  fetchGitHubReviewRequestedPRs,
  fetchGitHubPRDetails,
  parsePRStatus,
  type GhRawPR,
} from './github-pulls.api'

/**
 * The dashboard's pull-request list: the two searches, plus what each result needs to render.
 *
 * Lifted out of `useGitHubData` because none of it is React — it is API composition, and the hook
 * had grown a forty-line fetcher around it. What follows is the part worth reading.
 *
 * # The shape this had, and why it was a problem
 *
 * Two `search/issues` calls, then for every pull request in the union: one details call and two CI
 * calls, all issued through a single `Promise.all`. Twenty-five open pull requests meant
 * seventy-five requests leaving at once, once a minute, from one token.
 *
 * The *quota* half of that is now handled a layer down — `services/github_etag_cache.rs` sends
 * `If-None-Match`, and an unchanged resource comes back `304`, which GitHub does not bill. That is
 * also why this is not the GraphQL rewrite it might look like it wants to be: a single aliased query
 * would answer everything in one call, but GraphQL is POST-only and cannot be conditional, so it
 * would cost its (substantial) score *every* minute where the conditional REST path settles at
 * roughly zero. The measured-looking rewrite is the more expensive one.
 *
 * What the cache does not fix is the burst. Seventy-five simultaneous connections is the shape
 * GitHub's *secondary* rate limits exist to stop — its own guidance is to make a single user's
 * requests serially — and a request that costs no quota still costs a connection. So two things
 * changed here instead:
 *
 * * **A ceiling on concurrency** ({@link ENRICHMENT_CONCURRENCY}), so the same work leaves as a
 *   trickle rather than a flood.
 * * **A details call skipped entirely when the pull request has not moved.** `updated_at` comes free
 *   on the search result, and everything the details call adds — the diff counts, the mergeability,
 *   the draft flag, the lifecycle state — changes only when it does. This removes the round trip
 *   rather than making it cheap.
 *
 * The CI calls are deliberately *not* cached on `updated_at`: a check run completing does not touch
 * a pull request's `updated_at`, so keying its badge on that would freeze a running build on screen
 * forever. Those stay conditional requests, which is the right tool for a resource that changes
 * without warning.
 */

/**
 * Requests in flight during enrichment.
 *
 * Small on purpose. The work is bounded by GitHub's willingness to answer, not by the local
 * machine, and the whole point is to stop looking like a burst; six keeps a twenty-five pull-request
 * refresh comfortably inside a second while never having more open connections than a browser would
 * to one host.
 */
const ENRICHMENT_CONCURRENCY = 6

/** What the details call adds to a search result, and the `updated_at` it was true for. */
interface CachedDetails {
  updatedAt: string
  raw: GhRawPR
}

/**
 * `owner/repo#number` → the last details payload, and the `updated_at` it answered for.
 *
 * Session-scoped and unbounded in practice: it holds one small object per pull request the user has
 * open across every repository, which is tens, not thousands.
 */
const detailsCache = new Map<string, CachedDetails>()

/** Empties the details cache. For tests, and for a disconnect — a new token may see other PRs. */
export function clearDashboardCache(): void {
  detailsCache.clear()
}

/** The dashboard's pull requests, enriched — authored by the user, plus those awaiting their review. */
export async function fetchDashboardPullRequests(
  username: string,
  accountId: string
): Promise<MockPR[]> {
  const [authored, reviewRequested] = await Promise.all([
    fetchGitHubPRs(username, accountId),
    fetchGitHubReviewRequestedPRs(username, accountId),
  ])

  const byId = new Map<string, MockPR>()
  for (const pr of authored) byId.set(pr.id, pr)
  for (const pr of reviewRequested) {
    pr.needsMyReview = true
    byId.set(pr.id, pr)
  }

  const prs = [...byId.values()]
  await mapWithConcurrency(prs, ENRICHMENT_CONCURRENCY, (pr) => enrich(pr, accountId))
  return prs
}

/**
 * Fills one pull request in place with its details and CI verdict.
 *
 * Best effort throughout: a pull request that cannot be enriched is still shown, with the search
 * result's own fields. Failing the whole dashboard because one repository answered 403 would be a
 * worse answer than a slightly thinner row.
 */
async function enrich(pr: MockPR, accountId: string): Promise<void> {
  try {
    const ownerRepo = pr.fullName || pr.repoUrl.split('github.com/')[1] || ''
    if (!ownerRepo) return

    const full = await prDetails(ownerRepo, pr, accountId)

    pr.additions = full.additions ?? 0
    pr.deletions = full.deletions ?? 0
    pr.filesChanged = full.changed_files ?? pr.filesChanged
    pr.needsRebase = full.mergeable === false || full.mergeable_state === 'behind'
    pr.headRef = full.head?.ref ?? pr.headRef
    // The lists come from `search/issues`, whose items are issue-shaped and lag behind the real PR
    // by up to a minute. This payload is the authoritative one — re-derive every lifecycle field
    // from it, or a PR merged since the last poll stays labelled as merely closed (red "closed
    // without merging" instead of the purple merge).
    pr.status = parsePRStatus(full)
    pr.isDraft = full.draft ?? pr.isDraft
    pr.autoMerge = !!full.auto_merge

    const sha = full.head?.sha
    const [owner, repo] = ownerRepo.split('/')
    if (!owner || !repo || !sha) return

    const { checkRunsRes, statusRes } = await fetchGitHubCommitCiStatus(owner, repo, sha, accountId)
    const { overall, details } = resolveCiStatus(checkRunsRes, statusRes)
    if (details.length > 0) pr.ciDetails = details
    pr.ciStatus = overall
  } catch (e) {
    console.error('Failed to enrich PR details', pr.number, e)
  }
}

/**
 * The pull request's details payload, fetched only if it can have changed since the last look.
 *
 * The search result's `updated_at` is the whole test: GitHub moves it for every event that alters
 * anything this payload carries. A pull request nobody has touched since the previous poll — which
 * is nearly all of them, nearly all the time — costs no request at all.
 */
async function prDetails(ownerRepo: string, pr: MockPR, accountId: string): Promise<GhRawPR> {
  const key = `${ownerRepo}#${pr.number}`
  const updatedAt = pr.updatedAt.toISOString()
  const cached = detailsCache.get(key)
  if (cached?.updatedAt === updatedAt) return cached.raw

  const raw = await fetchGitHubPRDetails(
    `https://api.github.com/repos/${ownerRepo}/pulls/${pr.number}`,
    accountId
  )
  detailsCache.set(key, { updatedAt, raw })
  return raw
}
