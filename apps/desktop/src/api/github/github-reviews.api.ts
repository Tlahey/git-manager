import { type GhUser, ghFetch, ghRequest, ghGraphQL } from './githubApiShared'
import type { PrReviewDecision } from './github-checks.api'

/** One reviewer's standing on a PR — either a review they left, or a pending request. */
export interface PrReviewer {
  login: string
  avatarUrl: string
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING'
}

/** Review + checks rollup for one PR, sized for the sidebar's hover card. */
export interface PrReviewSummary {
  reviewDecision: PrReviewDecision
  reviewers: PrReviewer[]
  /** GitHub's single-enum rollup over all checks, or null when the head commit has no checks. */
  checksState: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'ERROR' | 'EXPECTED' | null
}

/**
 * The reviewer/approval/checks state of one pull request, in a single GraphQL round-trip.
 *
 * Deliberately lighter than {@link fetchPrMergeability}: this backs a hover card, so it asks for
 * the rollup's single `state` enum rather than the up-to-100 individual check contexts the merge
 * box needs. `latestOpinionatedReviews` is GitHub's own "one row per reviewer, latest verdict
 * wins" list — the same reduction the PR page's reviewer sidebar shows.
 */
export async function fetchPrReviewSummary(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<PrReviewSummary> {
  const query = `query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){
      pullRequest(number:$number){
        reviewDecision
        latestOpinionatedReviews(first:20){nodes{state author{login avatarUrl}}}
        reviewRequests(first:20){nodes{requestedReviewer{
          ... on User{login avatarUrl}
          ... on Team{login:name avatarUrl}
        }}}
        commits(last:1){nodes{commit{statusCheckRollup{state}}}}
      }
    }
  }`

  interface RawActor {
    login?: string
    avatarUrl?: string
  }
  const data = await ghGraphQL<{
    repository?: {
      pullRequest?: {
        reviewDecision?: PrReviewDecision
        latestOpinionatedReviews?: {
          nodes?: Array<{ state?: string; author?: RawActor | null } | null>
        }
        reviewRequests?: { nodes?: Array<{ requestedReviewer?: RawActor | null } | null> }
        commits?: {
          nodes?: Array<{
            commit?: { statusCheckRollup?: { state?: PrReviewSummary['checksState'] } | null }
          }>
        }
      }
    }
  }>(query, { owner, repo, number: prNumber }, token)

  const prNode = data.repository?.pullRequest
  const reviewers: PrReviewer[] = []
  for (const node of prNode?.latestOpinionatedReviews?.nodes ?? []) {
    if (!node?.author?.login) continue
    const state = node.state
    reviewers.push({
      login: node.author.login,
      avatarUrl: node.author.avatarUrl ?? '',
      state:
        state === 'APPROVED' || state === 'CHANGES_REQUESTED' || state === 'COMMENTED'
          ? state
          : 'PENDING',
    })
  }
  // A still-requested reviewer has no review yet, so they never appear above — append them as
  // pending, skipping anyone who already reviewed (GitHub can re-request a review after one lands).
  for (const node of prNode?.reviewRequests?.nodes ?? []) {
    const login = node?.requestedReviewer?.login
    if (!login || reviewers.some((r) => r.login === login)) continue
    reviewers.push({ login, avatarUrl: node?.requestedReviewer?.avatarUrl ?? '', state: 'PENDING' })
  }

  return {
    reviewDecision: prNode?.reviewDecision ?? null,
    reviewers,
    checksState: prNode?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
  }
}

/** GitHub's per-viewer "reviewed this file" state — mirrors github.com's Files Changed checkboxes.
 * GitHub itself resets a file back to UNVIEWED whenever new commits touch it, so this is always
 * read fresh from the API rather than diffed/cached locally. */
export type PrFileViewedState = 'VIEWED' | 'DISMISSED' | 'UNVIEWED'

export interface PrFilesViewedState {
  /** The PR's GraphQL node id — required by the mark/unmark-as-viewed mutations. */
  pullRequestId: string
  /** Per-path viewed state for every file GitHub currently reports on the PR. */
  viewedByPath: Record<string, PrFileViewedState>
}

/** Fetches viewer-viewed state for every file on a PR (GraphQL-only — the REST files endpoint has no
 * equivalent field), plus the PR's node id needed to mark/unmark a file. */
export async function fetchPrFilesViewedState(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<PrFilesViewedState> {
  const query = `query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){
      pullRequest(number:$number){
        id
        files(first:100){nodes{path viewerViewedState}}
      }
    }
  }`
  const data = await ghGraphQL<{
    repository?: {
      pullRequest?: {
        id?: string
        files?: { nodes?: Array<{ path: string; viewerViewedState: PrFileViewedState }> }
      }
    }
  }>(query, { owner, repo, number: prNumber }, token)
  const prNode = data.repository?.pullRequest
  const nodes = prNode?.files?.nodes ?? []
  return {
    pullRequestId: prNode?.id ?? '',
    viewedByPath: Object.fromEntries(nodes.map((n) => [n.path, n.viewerViewedState])),
  }
}

/** Marks a single PR file as reviewed for the current viewer (GitHub's "Viewed" checkbox). */
export async function markPrFileAsViewed(
  pullRequestId: string,
  path: string,
  token: string
): Promise<void> {
  await ghGraphQL(
    `mutation($id:ID!,$path:String!){markFileAsViewed(input:{pullRequestId:$id,path:$path}){clientMutationId}}`,
    { id: pullRequestId, path },
    token
  )
}

/** Reverts a PR file to unviewed for the current viewer. */
export async function unmarkPrFileAsViewed(
  pullRequestId: string,
  path: string,
  token: string
): Promise<void> {
  await ghGraphQL(
    `mutation($id:ID!,$path:String!){unmarkFileAsViewed(input:{pullRequestId:$id,path:$path}){clientMutationId}}`,
    { id: pullRequestId, path },
    token
  )
}

/** Post a plain issue-style comment on a pull request. */
export async function postPrComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  token: string
): Promise<{ id: number; html_url: string }> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    body: { body },
    token,
  })
}

export type PrReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'

/** Submit a formal review (Approve / Request changes / Comment) on a pull request. */
export async function submitPrReview(
  owner: string,
  repo: string,
  prNumber: number,
  input: { event: PrReviewEvent; body?: string },
  token: string
): Promise<{ id: number; state: string }> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    body: input,
    token,
  })
}

export interface GhComment {
  id: number
  body: string
  html_url: string
  created_at: string
  updated_at: string
  user?: GhUser
}

/** Issue-style comments on a pull request (the conversation timeline, not inline review comments). */
export async function fetchPrComments(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<GhComment[]> {
  return ghFetch<GhComment[]>(
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`,
    token
  )
}

// ─── unresolved review threads ("code suggestions") ────────────────────────────

export interface PrReviewThread {
  id: string
  path: string
  line: number | null
  isOutdated: boolean
  author: string
  snippet: string
  /** Link to the first comment of the thread (for the "go to comment" click-through). */
  url: string
}

/**
 * Unresolved review threads on a PR — the inline code comments/suggestions still open. Only GraphQL
 * exposes a thread's `isResolved`, so this is a GraphQL query. Returns the still-open threads only.
 */
export async function fetchPrReviewThreads(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<PrReviewThread[]> {
  const query = `query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){
      pullRequest(number:$number){
        reviewThreads(first:100){nodes{
          id isResolved isOutdated path line
          comments(first:1){nodes{ author{login} bodyText url }}
        }}
      }
    }
  }`
  const data = await ghGraphQL<{
    repository?: {
      pullRequest?: {
        reviewThreads?: {
          nodes?: Array<{
            id: string
            isResolved: boolean
            isOutdated: boolean
            path: string
            line: number | null
            comments?: {
              nodes?: Array<{ author?: { login?: string }; bodyText?: string; url?: string }>
            }
          }>
        }
      }
    }
  }>(query, { owner, repo, number: prNumber }, token)

  const nodes = data.repository?.pullRequest?.reviewThreads?.nodes ?? []
  return nodes
    .filter((n) => !n.isResolved)
    .map((n) => {
      const first = n.comments?.nodes?.[0]
      return {
        id: n.id,
        path: n.path,
        line: n.line,
        isOutdated: n.isOutdated,
        author: first?.author?.login ?? '—',
        snippet: (first?.bodyText ?? '').trim(),
        url: first?.url ?? '',
      }
    })
}
