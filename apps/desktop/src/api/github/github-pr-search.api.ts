import type { PrParticipant, PullRequest } from '@git-manager/git-types'
import { ghGraphQL } from './githubApiShared'
import { fetchPullRequestsByQuery } from './github-pulls.api'

/**
 * The sidebar's saved pull-request filters, resolved in **one** request instead of one per filter.
 *
 * # Why this is the one place bulking beats a conditional request
 *
 * Everywhere else in this app, polling is best served by REST plus `If-None-Match`: an unchanged
 * resource comes back `304`, which GitHub does not bill, so a poll that changes nothing costs
 * nothing. GraphQL is POST-only and cannot be conditional, so bulking a poll normally means trading
 * "usually free" for "always costs its score" — a bad trade sixty times an hour.
 *
 * The saved filters are the exception, for two reasons that do not hold elsewhere:
 *
 * * **They are the only GitHub call whose count grows with what the user configures.** Five saved
 *   filters is five requests a minute, per repository tab, forever.
 * * **They are billed to `search`, which is thirty requests a *minute*** — not five thousand an
 *   hour. That is the allowance the app is most likely to exhaust, and exhausting it is what makes
 *   the sidebar's groups go empty. A GraphQL search is billed to `graphql` instead, where the same
 *   work is a rounding error.
 *
 * The 304s would help less here anyway: a saved filter is a *search*, and its results move whenever
 * any matching pull request does — so the conditional request that pays for itself on a single PR's
 * details pays much less often on this.
 *
 * # The REST path is still here, as a fallback
 *
 * One query means one failure. A filter whose search syntax GitHub rejects would take every other
 * group down with it, where today each group carries its own error — and a saved filter is
 * user-written text, so bad syntax is a normal state, not an exceptional one. So a failed bulk falls
 * back to the per-filter REST calls it replaced, each with its own error. The bulk is a fast path,
 * not a replacement, and the slow path is the one that was already proven.
 */

/** One saved filter's result: its pull requests, or why there are none. */
export interface PrQueryGroup {
  /** The raw GitHub search query this answers, echoed back so callers can match it up. */
  query: string
  prs: PullRequest[]
  error: string | null
}

/**
 * Aliased searches per request.
 *
 * A GraphQL call's score counts one request per connection, plus one per parent object for each
 * nested connection — so a search of a hundred results with three nested connections is roughly
 * three points, and a dozen of them in one document stays comfortably cheap. The cap exists so that
 * a user with an implausible number of saved filters splits into two requests rather than building
 * one query GitHub might refuse outright.
 */
const MAX_SEARCHES_PER_QUERY = 12

/** GraphQL's own `PullRequestState`, plus the draft flag that is not part of it. */
interface GqlPullRequest {
  number: number
  title: string
  body: string | null
  url: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  createdAt: string
  updatedAt: string
  headRefName: string | null
  baseRefName: string | null
  author: { login?: string; avatarUrl?: string } | null
  labels: { nodes: Array<{ name: string } | null> | null } | null
  assignees: { nodes: Array<{ login: string; avatarUrl: string } | null> | null } | null
  reviewRequests: {
    nodes: Array<{ requestedReviewer: { login?: string; avatarUrl?: string } | null } | null> | null
  } | null
}

const PR_FRAGMENT = `fragment PrFields on PullRequest {
  number
  title
  body
  url
  state
  isDraft
  createdAt
  updatedAt
  headRefName
  baseRefName
  author { login avatarUrl }
  labels(first: 20) { nodes { name } }
  assignees(first: 10) { nodes { login avatarUrl } }
  reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login avatarUrl } } } }
}`

/**
 * Resolves every saved filter of one repository, bulked into as few requests as possible.
 *
 * Order matches `queries`, so a caller can zip the results back onto its own filter list.
 */
export async function fetchPullRequestGroups(
  owner: string,
  repo: string,
  queries: string[],
  accountId?: string
): Promise<PrQueryGroup[]> {
  if (queries.length === 0) return []

  const groups: PrQueryGroup[] = []
  for (let i = 0; i < queries.length; i += MAX_SEARCHES_PER_QUERY) {
    const chunk = queries.slice(i, i + MAX_SEARCHES_PER_QUERY)
    groups.push(...(await resolveChunk(owner, repo, chunk, accountId)))
  }
  return groups
}

/** One bulked request, falling back to the per-filter REST calls if it cannot be answered. */
async function resolveChunk(
  owner: string,
  repo: string,
  queries: string[],
  accountId?: string
): Promise<PrQueryGroup[]> {
  // Anonymous requests cannot use GraphQL — GitHub's v4 endpoint requires a token — so the REST
  // path, which a public repository does answer signed out, stays the answer for them.
  if (accountId) {
    try {
      return await bulkSearch(owner, repo, queries, accountId)
    } catch (e) {
      console.warn(
        `[github] bulk PR filter search for ${owner}/${repo} failed; falling back per filter`,
        e
      )
    }
  }
  return restFallback(owner, repo, queries, accountId)
}

async function bulkSearch(
  owner: string,
  repo: string,
  queries: string[],
  accountId: string
): Promise<PrQueryGroup[]> {
  const declarations = queries.map((_, i) => `$q${i}:String!`).join(',')
  const fields = queries
    .map((_, i) => `f${i}: search(query:$q${i}, type:ISSUE, first:100){ nodes { ...PrFields } }`)
    .join('\n')
  const document = `query(${declarations}){
    ${fields}
  }
  ${PR_FRAGMENT}`

  const variables: Record<string, unknown> = {}
  queries.forEach((query, i) => {
    variables[`q${i}`] = searchExpression(owner, repo, query)
  })

  const data = await ghGraphQL<Record<string, { nodes: Array<GqlPullRequest | null> | null }>>(
    document,
    variables,
    accountId
  )

  return queries.map((query, i) => ({
    query,
    // A `search` alias whose nodes are absent is an empty result, not a failure — the union can
    // legitimately contain nothing this fragment matches.
    prs: (data[`f${i}`]?.nodes ?? []).filter(isPullRequest).map(toPullRequest),
    error: null,
  }))
}

/** The per-filter REST path this replaced, kept whole so a failed bulk degrades rather than breaks. */
async function restFallback(
  owner: string,
  repo: string,
  queries: string[],
  accountId?: string
): Promise<PrQueryGroup[]> {
  return Promise.all(
    queries.map(async (query) => {
      try {
        return {
          query,
          prs: await fetchPullRequestsByQuery(owner, repo, query, accountId),
          error: null,
        }
      } catch (err) {
        return { query, prs: [], error: String(err) }
      }
    })
  )
}

/**
 * Scopes a saved filter to its repository, exactly as the REST path does.
 *
 * Kept identical on purpose: the two paths must return the same pull requests, or a fallback would
 * quietly change what the sidebar shows.
 */
export function searchExpression(owner: string, repo: string, query: string): string {
  return `repo:${owner}/${repo} is:pr ${query}`.trim()
}

function isPullRequest(node: GqlPullRequest | null): node is GqlPullRequest {
  return node != null && typeof node.number === 'number'
}

function toParticipants(
  nodes: Array<{ login?: string; avatarUrl?: string } | null> | null | undefined
): PrParticipant[] {
  return (nodes ?? [])
    .filter((n): n is { login: string; avatarUrl?: string } => !!n?.login)
    .map((n) => ({ login: n.login, avatarUrl: n.avatarUrl ?? '' }))
}

function toPullRequest(node: GqlPullRequest): PullRequest {
  return {
    number: node.number,
    title: node.title,
    body: node.body ?? '',
    // GraphQL reports `MERGED` outright, where REST reports `closed` plus a `merged_at` timestamp
    // that has to be read to tell the two apart. The precedence is the REST mapping's, so both paths
    // agree: merged wins, then draft, then closed.
    state: node.state === 'MERGED' ? 'merged' : node.isDraft ? 'draft' : stateOf(node.state),
    author: node.author?.login ?? '—',
    authorAvatar: node.author?.avatarUrl ?? '',
    // Filled here, and empty on the REST path: `search/issues` returns the *issue* representation of
    // a pull request, which carries no head/base. Nothing regresses — a group whose PR is also in
    // the repository's own list already prefers that copy — but a PR only this search found now
    // knows its branch too.
    headRef: node.headRefName ?? '',
    baseRef: node.baseRefName ?? '',
    url: node.url,
    ciStatus: null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    isDraft: node.isDraft,
    assignees: toParticipants(node.assignees?.nodes),
    requestedReviewers: toParticipants(
      (node.reviewRequests?.nodes ?? []).map((n) => n?.requestedReviewer ?? null)
    ),
    labels: (node.labels?.nodes ?? []).filter((l) => !!l).map((l) => l.name),
  }
}

function stateOf(state: GqlPullRequest['state']): PullRequest['state'] {
  return state === 'CLOSED' ? 'closed' : 'open'
}
