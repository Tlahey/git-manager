import type { MockPR, PRStatus } from '../../app/pull-requests/types'
import type { PrParticipant, PullRequest } from '@git-manager/git-types'
import { type GhUser, type GhLabel, type GhSearchResult, ghFetch, ghRequest, ghGraphQL } from './githubApiShared'
import type { GhRawIssue } from './github-issues.api'

export interface GhRawPR {
  number: number
  /** GraphQL global node id — needed for the draft toggle (a GraphQL-only mutation). */
  node_id?: string
  title: string
  body?: string | null
  html_url: string
  state: string
  draft: boolean
  merged_at: string | null
  user?: GhUser
  requested_reviewers?: GhUser[]
  assignees?: GhUser[]
  labels?: GhLabel[]
  changed_files?: number
  additions?: number
  deletions?: number
  created_at: string
  updated_at: string
  comments?: number
  base?: {
    ref?: string
    sha?: string
    repo?: { name?: string; html_url?: string; full_name?: string }
  }
  head?: { ref?: string; sha?: string }
  repository_url?: string
  mergeable?: boolean | null
  mergeable_state?: string
  /**
   * Only present on `search/issues` items, which are *issue*-shaped: they carry no top-level
   * `merged_at`, and nest the PR-specific fields here instead. Without reading it, every merged PR
   * coming out of a search reads as a plain `state: 'closed'` — i.e. "closed without merging".
   */
  pull_request?: { merged_at?: string | null }
  /**
   * Set once "auto-merge" (a.k.a. "merge when ready" / entering the repo's merge queue) is enabled
   * on the PR, null otherwise. Only the PR *details* endpoint returns it — never a search item.
   */
  auto_merge?: { enabled_by?: GhUser; merge_method?: string } | null
}

/**
 * A merged PR reports GitHub `state: 'closed'` and marks the merge only through `merged_at`, so
 * "merged" has to be read from that timestamp — which lives in a different place depending on the
 * endpoint: top-level on a real PR payload, under `pull_request` on a `search/issues` item.
 * Reading both is what keeps a merged PR from being reported as closed-without-merging.
 */
export function isMergedRawPr(pr: {
  merged_at?: string | null
  pull_request?: { merged_at?: string | null }
}): boolean {
  return !!(pr.merged_at || pr.pull_request?.merged_at)
}

export function parsePRStatus(pr: {
  state: string
  draft?: boolean
  merged_at?: string | null
  pull_request?: { merged_at?: string | null }
}): PRStatus {
  if (isMergedRawPr(pr)) return 'merged'
  if (pr.draft) return 'draft'
  if (pr.state === 'closed') return 'closed'
  return 'open'
}

/**
 * Narrow a raw GitHub PR to the DTO's `PrState`. A merged PR reports GitHub `state: 'closed'` +
 * `merged_at` (never `'merged'`), so merge must be detected via `merged_at` rather than taken
 * verbatim. (Distinct from `parsePRStatus`, whose wider `PRStatus` carries review states the DTO
 * doesn't model.)
 */
function toPrState(
  raw: Pick<GhRawPR, 'state' | 'draft' | 'merged_at' | 'pull_request'>
): PullRequest['state'] {
  if (isMergedRawPr(raw)) return 'merged'
  if (raw.draft) return 'draft'
  if (raw.state === 'closed') return 'closed'
  return 'open'
}

function toParticipants(users: GhUser[] | undefined): PrParticipant[] {
  return (users ?? []).map((u) => ({ login: u.login, avatarUrl: u.avatar_url }))
}

/**
 * Map a raw GitHub PR list item to the IPC-shaped `PullRequest` DTO. `ciStatus` is left null — the
 * list endpoint doesn't carry it.
 */
export function rawToPullRequest(raw: GhRawPR): PullRequest {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? '',
    state: toPrState(raw),
    author: raw.user?.login ?? '—',
    authorAvatar: raw.user?.avatar_url ?? '',
    headRef: raw.head?.ref ?? '',
    baseRef: raw.base?.ref ?? '',
    url: raw.html_url,
    ciStatus: null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    isDraft: raw.draft,
    assignees: toParticipants(raw.assignees),
    requestedReviewers: toParticipants(raw.requested_reviewers),
    labels: (raw.labels ?? []).map((l) => l.name),
  }
}

/** Extract repo name from various fields available in search results */
export function extractRepoInfo(
  raw: Pick<GhRawPR & GhRawIssue, 'base' | 'repository_url' | 'html_url'>
): { repo: string; repoUrl: string; fullName: string } {
  if (raw.base?.repo?.name) {
    return {
      repo: raw.base.repo.name,
      repoUrl: raw.base.repo.html_url ?? '',
      fullName: raw.base.repo.full_name ?? '',
    }
  }
  if (raw.repository_url) {
    const parts = raw.repository_url.split('/')
    const repoName = parts[parts.length - 1] ?? 'unknown'
    const owner = parts[parts.length - 2] ?? ''
    return {
      repo: repoName,
      repoUrl: `https://github.com/${owner}/${repoName}`,
      fullName: `${owner}/${repoName}`,
    }
  }
  if (raw.html_url) {
    const match = raw.html_url.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (match)
      return {
        repo: match[2],
        repoUrl: `https://github.com/${match[1]}/${match[2]}`,
        fullName: `${match[1]}/${match[2]}`,
      }
  }
  return { repo: 'unknown', repoUrl: '', fullName: 'unknown' }
}

export function rawToMockPR(raw: GhRawPR, currentUser: string): MockPR {
  const { repo, repoUrl, fullName } = extractRepoInfo(raw)
  return {
    id: `gh-pr-${raw.number}-${fullName || 'unknown'}`,
    number: raw.number,
    title: raw.title,
    repo,
    repoUrl,
    fullName,
    url: raw.html_url,
    status: parsePRStatus(raw),
    ciStatus: null,
    autoMerge: !!raw.auto_merge,
    author: raw.user?.login ?? '—',
    authorAvatar: raw.user?.avatar_url ?? '',
    collaborators: (raw.requested_reviewers ?? []).map((r) => ({
      login: r.login,
      avatar: r.avatar_url,
    })),
    filesChanged: raw.changed_files ?? 0,
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
    reviewStatus: 'pending',
    isDraft: raw.draft ?? false,
    needsMyReview:
      raw.state === 'open' &&
      raw.user?.login !== currentUser &&
      (raw.requested_reviewers ?? []).some((r) => r.login === currentUser),
    labels: (raw.labels ?? []).map((l) => l.name),
    comments: raw.comments ?? 0,
  }
}

export async function fetchGitHubPRs(username: string, token: string): Promise<MockPR[]> {
  const data = await ghFetch<GhSearchResult<GhRawPR>>(
    `https://api.github.com/search/issues?q=is:pr+author:${username}+is:open&per_page=50&sort=updated`,
    token
  )
  return (data.items ?? []).map((item) => rawToMockPR(item, username))
}

export async function fetchGitHubReviewRequestedPRs(
  username: string,
  token: string
): Promise<MockPR[]> {
  const data = await ghFetch<GhSearchResult<GhRawPR>>(
    `https://api.github.com/search/issues?q=is:pr+review-requested:${username}+is:open&per_page=50&sort=updated`,
    token
  )
  return (data.items ?? []).map((item) => {
    const pr = rawToMockPR(item, username)
    pr.needsMyReview = true
    return pr
  })
}

/**
 * Pull requests of one repository matching a **raw GitHub search query** — the sidebar's saved PR
 * filters (see `features/graph/stores/prFilters.store.ts`). The issue-side twin of {@link fetchIssuesByQuery};
 * only `repo:` and `is:pr` are prepended.
 *
 * Search returns the *issue* representation of a pull request, which carries no `head`/`base`, so
 * `headRef`/`baseRef` come back empty here. That is why this backs the grouping only: the branch
 * tags on branch/worktree rows keep reading {@link fetchRepoPRs}, whose full PR objects have them.
 */
export async function fetchPullRequestsByQuery(
  owner: string,
  repo: string,
  query: string,
  token?: string
): Promise<PullRequest[]> {
  const q = `repo:${owner}/${repo} is:pr ${query}`.trim()
  const data = await ghFetch<GhSearchResult<GhRawPR>>(
    `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=100&sort=updated&order=desc`,
    token
  )
  return (data.items ?? []).map(rawToPullRequest)
}

export async function fetchGitHubPRDetails(prApiUrl: string, token: string): Promise<GhRawPR> {
  return ghFetch<GhRawPR>(prApiUrl, token)
}

// For usePullRequests.ts
export async function fetchRepoPRs(
  owner: string,
  repo: string,
  token?: string
): Promise<GhRawPR[]> {
  return ghFetch<GhRawPR[]>(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`,
    token
  )
}

export interface CommitPrRef {
  number: number
  url: string
  title: string
  state: string
  merged: boolean
}

/**
 * The repo's most recently updated closed pull requests (merged or not), for matching a local
 * branch name against its PR's `head.ref`/`merged_at` fields client-side. This is deliberately
 * NOT commit- or search-based: `fetchCommitPullRequest`'s `commits/{sha}/pulls` only reports a
 * "merged" PR when the commit is reachable from the default branch — never true for a squash/
 * rebase merge — and GitHub search's `head:`/REST `head=` filters both key off the *live* branch
 * ref, which is unreliable once GitHub auto-deletes the branch after merge (the common case).
 * `head.ref`/`merged_at` on a plain PR list item, by contrast, are just stored fields on the PR
 * resource itself and persist regardless of whether the branch still exists. A merge always
 * touches `updated_at`, so sorting by `updated` means a just-merged PR is virtually guaranteed to
 * land within the first page even on a repo with a long PR history — matching the single-page
 * approach every other GitHub list call in this file already uses (no pagination anywhere else).
 */
export async function fetchClosedPullRequests(
  owner: string,
  repo: string,
  token?: string
): Promise<GhRawPR[]> {
  return ghFetch<GhRawPR[]>(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`,
    token
  ).catch(() => [] as GhRawPR[])
}

/** The pull request associated with a commit (the one that introduced/merged it), or null. */
export async function fetchCommitPullRequest(
  owner: string,
  repo: string,
  sha: string,
  token?: string
): Promise<CommitPrRef | null> {
  const items = await ghFetch<GhRawPR[]>(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/pulls`,
    token
  ).catch(() => [] as GhRawPR[])
  if (!items || items.length === 0) return null
  // Prefer a merged PR (the one that actually shipped the commit), else the first association.
  const best = items.find((p) => p.merged_at) ?? items[0]
  return {
    number: best.number,
    url: best.html_url,
    title: best.title,
    state: best.state,
    merged: !!best.merged_at,
  }
}

/**
 * The merged pull request whose source branch is exactly `branch` AND which contains `sha`, or
 * null. This is the branch-eligibility variant of `fetchCommitPullRequest`: `commits/{sha}/pulls`
 * lists every PR *containing* the commit, so a branch with no unique commits (freshly created from
 * main, or whose work only exists remotely) reports the unrelated PR that shipped its fork-point
 * commit — accepting any merged association there once bulk-deleted a worktree whose own branch
 * had never been merged. Requiring `head.ref === branch` keeps only the PR that actually merged
 * *this* branch.
 */
export async function fetchCommitMergedPullRequestForBranch(
  owner: string,
  repo: string,
  sha: string,
  branch: string,
  token?: string
): Promise<{ number: number; title: string; author?: string } | null> {
  const items = await ghFetch<GhRawPR[]>(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/pulls`,
    token
  ).catch(() => [] as GhRawPR[])
  const match = items?.find((p) => p.head?.ref === branch && p.merged_at)
  return match ? { number: match.number, title: match.title, author: match.user?.login } : null
}

/** A single file changed by a pull request (`GET /pulls/{n}/files`). */
export interface GhPrFile {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  previous_filename?: string
  /** Unified-diff hunks for the file. Absent for binary files and very large diffs. */
  patch?: string
}

export interface CreatePrInput {
  title: string
  head: string
  base: string
  body?: string
  /** Open the PR as a draft. Accepted by GitHub's `POST /pulls` endpoint. */
  draft?: boolean
}

/** Create a pull request. Requires the `repo` scope on the token. */
export async function createPullRequest(
  owner: string,
  repo: string,
  input: CreatePrInput,
  token: string
): Promise<GhRawPR> {
  return ghRequest<GhRawPR>(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: input,
    token,
  })
}

/** The list of files changed by a pull request. */
export async function fetchPrFiles(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<GhPrFile[]> {
  return ghFetch<GhPrFile[]>(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
    token
  )
}

/**
 * Raw text content of a file at a git ref, via the contents API `raw` media type. Returns null when
 * the file doesn't exist at that ref (e.g. an added file has no version on the base) — the caller
 * treats that as an empty side of the diff.
 */
export async function fetchFileContentAtRef(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string
): Promise<string | null> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    { headers: { Accept: 'application/vnd.github.raw', Authorization: `token ${token}` } }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  return res.text()
}

export type MergeMethod = 'merge' | 'squash' | 'rebase'

/** Merge a pull request with the chosen strategy. */
export async function mergePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  input: { mergeMethod: MergeMethod; commitTitle?: string; commitMessage?: string },
  token: string
): Promise<{ sha: string; merged: boolean; message: string }> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: {
      merge_method: input.mergeMethod,
      commit_title: input.commitTitle,
      commit_message: input.commitMessage,
    },
    token,
  })
}

/** Patch a pull request's editable fields: title, body, or open/closed `state`. Requires the `repo`
 * scope. Note: the `draft` flag is *not* patchable over REST — use {@link setPullRequestDraft}. */
export async function updatePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  patch: { title?: string; body?: string; state?: 'open' | 'closed'; base?: string },
  token: string
): Promise<GhRawPR> {
  return ghRequest<GhRawPR>(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
    method: 'PATCH',
    body: patch,
    token,
  })
}

/**
 * Toggle a PR's draft state. GitHub's REST API can't change `draft`, so this uses the GraphQL
 * `convertPullRequestToDraft` / `markPullRequestReadyForReview` mutations, keyed by the PR's global
 * `node_id`. Returns the resulting draft flag.
 */
export async function setPullRequestDraft(
  nodeId: string,
  draft: boolean,
  token: string
): Promise<boolean> {
  const mutation = draft
    ? `mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id}){pullRequest{isDraft}}}`
    : `mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{isDraft}}}`
  const data = await ghGraphQL<{
    convertPullRequestToDraft?: { pullRequest?: { isDraft: boolean } }
    markPullRequestReadyForReview?: { pullRequest?: { isDraft: boolean } }
  }>(mutation, { id: nodeId }, token)
  const pr =
    data.convertPullRequestToDraft?.pullRequest ?? data.markPullRequestReadyForReview?.pullRequest
  return pr?.isDraft ?? draft
}

/** Update (merge base into) the PR's branch so it's no longer behind — the "Update branch" action. */
export async function updatePrBranch(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<void> {
  await ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/update-branch`, {
    method: 'PUT',
    body: {},
    token,
  })
}

/** The repository's default branch (the base a PR targets unless overridden). */
export async function fetchRepoDefaultBranch(
  owner: string,
  repo: string,
  token?: string
): Promise<string> {
  const data = await ghFetch<{ default_branch?: string }>(
    `https://api.github.com/repos/${owner}/${repo}`,
    token
  )
  return data.default_branch ?? 'main'
}
