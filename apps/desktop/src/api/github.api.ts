import type { MockPR, MockIssue, DayCommit, PRStatus } from '../app/pull-requests/types'

export interface GhUser {
  login: string
  avatar_url: string
}

export interface GhLabel {
  name: string
  /** 6-hex (no leading #) — GitHub's label color. */
  color?: string
  description?: string | null
}

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
  base?: { ref?: string; sha?: string; repo?: { name?: string; html_url?: string; full_name?: string } }
  head?: { ref?: string; sha?: string }
  repository_url?: string
  mergeable?: boolean | null
  mergeable_state?: string
}

export interface GhRawIssue {
  number: number
  title: string
  repository_url?: string
  html_url: string
  state: string
  user?: GhUser
  assignees?: GhUser[]
  labels?: GhLabel[]
  created_at: string
  updated_at: string
  comments?: number
}

interface GhSearchResult<T> {
  items: T[]
}

export interface GhCheckRun {
  name?: string
  status: string
  conclusion: string | null
  html_url?: string
}

export interface GhCheckRunsResponse {
  total_count?: number
  check_runs?: GhCheckRun[]
}

export interface GhCommitStatus {
  state: string
  context?: string
  target_url?: string
}

export interface GhCommitStatusResponse {
  total_count?: number
  state?: string
  statuses?: GhCommitStatus[]
}

function ghHeaders(token?: string): HeadersInit {
  const h: HeadersInit = { Accept: 'application/vnd.github.v3+json' }
  if (token) (h as Record<string, string>)['Authorization'] = `token ${token}`
  return h
}

interface GhRequestOptions {
  method?: string
  body?: unknown
  token?: string
}

/**
 * Low-level GitHub REST call with shared auth headers + error handling.
 * Backs both reads (`ghFetch`) and writes (create PR, comment, review, merge).
 */
async function ghRequest<T>(url: string, opts: GhRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = opts
  const headers = ghHeaders(token)
  if (body !== undefined) {
    ;(headers as Record<string, string>)['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, {
    method,
    headers,
    // GitHub's REST API sends `Cache-Control: max-age=60` on GETs (e.g. a PR's own detail
    // endpoint), so the webview's HTTP cache can silently serve a pre-merge response for up to a
    // minute even when SWR asks us to revalidate right after a merge/comment/review — the fetch()
    // call never reaches the network. Force every call through.
    cache: 'no-store',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    // Surface GitHub's own error detail (e.g. "Validation Failed: No commits between main and x",
    // "A pull request already exists") instead of a bare status — vital for debugging PR creation.
    const detail = await extractGitHubError(res)
    throw new Error(`GitHub API ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return res.json()
}

/** Best-effort extraction of a human-readable message from a GitHub error response body. */
async function extractGitHubError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as {
      message?: string
      errors?: Array<{ message?: string; field?: string; code?: string }>
    }
    const parts: string[] = []
    if (data.message) parts.push(data.message)
    for (const e of data.errors ?? []) {
      if (e.message) parts.push(e.message)
      else if (e.field && e.code) parts.push(`${e.field}: ${e.code}`)
    }
    return parts.join(' — ')
  } catch {
    return ''
  }
}

async function ghFetch<T>(url: string, token?: string): Promise<T> {
  return ghRequest<T>(url, { token })
}

/** GitHub GraphQL v4 call — for the operations REST can't do (draft toggle, `mergeStateStatus`,
 * per-check `isRequired`). `accept` lets callers opt into a preview media type when needed. */
async function ghGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
  accept = 'application/json'
): Promise<T> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', Accept: accept },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    throw new Error(`GitHub GraphQL ${res.status}`)
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> }
  if (json.errors?.length) {
    throw new Error(`GitHub GraphQL: ${json.errors.map((e) => e.message).join(' — ')}`)
  }
  return json.data as T
}

export function parsePRStatus(pr: {
  state: string
  draft: boolean
  merged_at: string | null
}): PRStatus {
  if (pr.merged_at) return 'merged'
  if (pr.draft) return 'draft'
  if (pr.state === 'closed') return 'closed'
  return 'open'
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
    status: parsePRStatus({ state: raw.state, draft: raw.draft, merged_at: raw.merged_at }),
    ciStatus: null,
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

export function rawToMockIssue(raw: GhRawIssue): MockIssue {
  return {
    id: `gh-issue-${raw.number}-${raw.repository_url?.split('/repos/')[1] ?? ''}`,
    number: raw.number,
    title: raw.title,
    repo: raw.repository_url?.split('/').slice(-1)[0] ?? 'unknown',
    url: raw.html_url,
    status: raw.state === 'open' ? 'open' : 'closed',
    author: raw.user?.login ?? '—',
    authorAvatar: raw.user?.avatar_url ?? '',
    assignees: (raw.assignees ?? []).map((a) => ({ login: a.login, avatar: a.avatar_url })),
    labels: (raw.labels ?? []).map((l) => l.name),
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
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

export async function fetchGitHubIssues(username: string, token: string): Promise<MockIssue[]> {
  const data = await ghFetch<GhSearchResult<GhRawIssue>>(
    `https://api.github.com/search/issues?q=is:issue+assignee:${username}&per_page=50&sort=updated`,
    token
  )
  return (data.items ?? []).map(rawToMockIssue)
}

export async function fetchGitHubPRDetails(prApiUrl: string, token: string): Promise<GhRawPR> {
  return ghFetch<GhRawPR>(prApiUrl, token)
}

export async function fetchGitHubCommitCiStatus(
  owner: string,
  repo: string,
  sha: string,
  token: string
): Promise<{ checkRunsRes: GhCheckRunsResponse | null; statusRes: GhCommitStatusResponse | null }> {
  const [checkRunsRes, statusRes] = await Promise.all([
    ghFetch<GhCheckRunsResponse>(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs`,
      token
    ).catch(() => null),
    ghFetch<GhCommitStatusResponse>(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`,
      token
    ).catch(() => null),
  ])
  return { checkRunsRes, statusRes }
}

/** Fetch full-year contribution calendar via GitHub GraphQL API */
export async function fetchGitHubContributions(
  username: string,
  token: string
): Promise<DayCommit[]> {
  const now = new Date()
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const query = `query($login:String!, $from:DateTime!, $to:DateTime!) {
    user(login:$login) {
      contributionsCollection(from:$from, to:$to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }`

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      variables: {
        login: username,
        from: oneYearAgo.toISOString(),
        to: now.toISOString(),
      },
    }),
  })

  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`)
  const json = await res.json()

  if (json?.errors) {
    throw new Error(json.errors.map((e: { message: string }) => e.message).join(', '))
  }

  const weeks = json?.data?.user?.contributionsCollection?.contributionCalendar?.weeks ?? []
  const days: DayCommit[] = []
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      days.push({ date: day.date, commits: day.contributionCount })
    }
  }
  return days
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
): Promise<{ number: number; title: string } | null> {
  const items = await ghFetch<GhRawPR[]>(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/pulls`,
    token
  ).catch(() => [] as GhRawPR[])
  const match = items?.find((p) => p.head?.ref === branch && p.merged_at)
  return match ? { number: match.number, title: match.title } : null
}

/** GitHub release page URL for a tag if a release exists, else null (a 404 = no release). */
export async function fetchReleaseUrlForTag(
  owner: string,
  repo: string,
  tag: string,
  token?: string
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    { headers: ghHeaders(token) }
  )
  if (!res.ok) return null
  const data = await res.json()
  return typeof data.html_url === 'string' ? data.html_url : null
}

/** URL to open for a tag: its GitHub release page when one exists, otherwise the tag page. */
export async function resolveTagOrReleaseUrl(
  owner: string,
  repo: string,
  tag: string,
  token?: string
): Promise<string> {
  const releaseUrl = await fetchReleaseUrlForTag(owner, repo, tag, token)
  return (
    releaseUrl ?? `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(tag)}`
  )
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
  const pr = data.convertPullRequestToDraft?.pullRequest ?? data.markPullRequestReadyForReview?.pullRequest
  return pr?.isDraft ?? draft
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

/** Normalised category for a single check/status row (drives its icon + grouping). */
export type PrCheckCategory = 'success' | 'failure' | 'in_progress' | 'skipped' | 'neutral'

export interface PrCheck {
  name: string
  category: PrCheckCategory
  /** Required by branch protection for this PR (the "Required" badge). */
  isRequired: boolean
  url?: string | null
  startedAt?: string | null
  /** The app/integration that produced the check (e.g. "GitHub Actions"). */
  appName?: string | null
}

/** GitHub's mergeability signal — same enum GitHub's merge box is driven by. */
export type PrMergeStateStatus =
  | 'BEHIND'
  | 'BLOCKED'
  | 'CLEAN'
  | 'DIRTY'
  | 'DRAFT'
  | 'HAS_HOOKS'
  | 'UNKNOWN'
  | 'UNSTABLE'

export type PrReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null

export interface PrMergeability {
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  mergeStateStatus: PrMergeStateStatus
  reviewDecision: PrReviewDecision
  checks: PrCheck[]
  /** Whether the current viewer can bypass branch protections and merge immediately
   * (GitHub's own "Merge without waiting for requirements to be met" affordance). */
  viewerCanMergeAsAdmin: boolean
}

interface RawCheckContext {
  __typename: 'CheckRun' | 'StatusContext'
  name?: string
  status?: string
  conclusion?: string | null
  startedAt?: string | null
  detailsUrl?: string | null
  context?: string
  state?: string
  targetUrl?: string | null
  isRequired?: boolean
  checkSuite?: { app?: { name?: string } | null } | null
}

function checkRunCategory(status?: string, conclusion?: string | null): PrCheckCategory {
  if (status !== 'COMPLETED') return 'in_progress'
  switch (conclusion) {
    case 'SUCCESS':
      return 'success'
    case 'SKIPPED':
      return 'skipped'
    case 'NEUTRAL':
    case 'STALE':
      return 'neutral'
    default:
      // FAILURE, TIMED_OUT, CANCELLED, ACTION_REQUIRED, STARTUP_FAILURE
      return 'failure'
  }
}

function statusContextCategory(state?: string): PrCheckCategory {
  switch (state) {
    case 'SUCCESS':
      return 'success'
    case 'PENDING':
    case 'EXPECTED':
      return 'in_progress'
    default:
      return 'failure' // FAILURE, ERROR
  }
}

function normalizeCheckContext(c: RawCheckContext): PrCheck {
  if (c.__typename === 'StatusContext') {
    return {
      name: c.context ?? 'status',
      category: statusContextCategory(c.state),
      isRequired: !!c.isRequired,
      url: c.targetUrl ?? null,
      startedAt: null,
      appName: null,
    }
  }
  return {
    name: c.name ?? 'check',
    category: checkRunCategory(c.status, c.conclusion),
    isRequired: !!c.isRequired,
    url: c.detailsUrl ?? null,
    startedAt: c.startedAt ?? null,
    appName: c.checkSuite?.app?.name ?? null,
  }
}

/**
 * Full mergeability + checks for one PR, via GraphQL (REST can't give per-check `isRequired`,
 * `mergeStateStatus` or `reviewDecision`). Powers the GitHub-style merge box.
 */
export async function fetchPrMergeability(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<PrMergeability> {
  const query = `query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){
      pullRequest(number:$number){
        mergeable
        mergeStateStatus
        reviewDecision
        viewerCanMergeAsAdmin
        commits(last:1){nodes{commit{statusCheckRollup{contexts(first:100){nodes{
          __typename
          ... on CheckRun{name status conclusion startedAt detailsUrl isRequired(pullRequestNumber:$number) checkSuite{app{name}}}
          ... on StatusContext{context state targetUrl isRequired(pullRequestNumber:$number)}
        }}}}}}
      }
    }
  }`
  const data = await ghGraphQL<{
    repository?: {
      pullRequest?: {
        mergeable?: PrMergeability['mergeable']
        mergeStateStatus?: PrMergeStateStatus
        reviewDecision?: PrReviewDecision
        viewerCanMergeAsAdmin?: boolean
        commits?: { nodes?: Array<{ commit?: { statusCheckRollup?: { contexts?: { nodes?: RawCheckContext[] } } } }> }
      }
    }
  }>(query, { owner, repo, number: prNumber }, token, 'application/vnd.github.merge-info-preview+json')

  const prNode = data.repository?.pullRequest
  const contexts = prNode?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? []
  return {
    mergeable: prNode?.mergeable ?? 'UNKNOWN',
    mergeStateStatus: prNode?.mergeStateStatus ?? 'UNKNOWN',
    reviewDecision: prNode?.reviewDecision ?? null,
    checks: contexts.map(normalizeCheckContext),
    viewerCanMergeAsAdmin: prNode?.viewerCanMergeAsAdmin ?? false,
  }
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

// ─── reviewers / assignees / labels ───────────────────────────────────────────

/** Users assignable to issues/PRs in the repo (also the candidate reviewer pool). */
export async function fetchAssignableUsers(
  owner: string,
  repo: string,
  token: string
): Promise<GhUser[]> {
  return ghFetch<GhUser[]>(
    `https://api.github.com/repos/${owner}/${repo}/assignees?per_page=100`,
    token
  )
}

/** All labels defined in the repo (the candidate pool for a PR's labels). */
export async function fetchRepoLabels(
  owner: string,
  repo: string,
  token: string
): Promise<GhLabel[]> {
  return ghFetch<GhLabel[]>(
    `https://api.github.com/repos/${owner}/${repo}/labels?per_page=100`,
    token
  )
}

/** Request reviews from the given logins. */
export async function addReviewers(
  owner: string,
  repo: string,
  prNumber: number,
  reviewers: string[],
  token: string
): Promise<unknown> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`, {
    method: 'POST',
    body: { reviewers },
    token,
  })
}

/** Cancel a pending review request for the given logins. */
export async function removeReviewers(
  owner: string,
  repo: string,
  prNumber: number,
  reviewers: string[],
  token: string
): Promise<unknown> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`, {
    method: 'DELETE',
    body: { reviewers },
    token,
  })
}

/** Add assignees (issue/PR share the assignee endpoints). */
export async function addAssignees(
  owner: string,
  repo: string,
  prNumber: number,
  assignees: string[],
  token: string
): Promise<unknown> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/assignees`, {
    method: 'POST',
    body: { assignees },
    token,
  })
}

/** Remove assignees. */
export async function removeAssignees(
  owner: string,
  repo: string,
  prNumber: number,
  assignees: string[],
  token: string
): Promise<unknown> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/assignees`, {
    method: 'DELETE',
    body: { assignees },
    token,
  })
}

/** Add labels by name. */
export async function addLabels(
  owner: string,
  repo: string,
  prNumber: number,
  labels: string[],
  token: string
): Promise<unknown> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels`, {
    method: 'POST',
    body: { labels },
    token,
  })
}

/** Remove a single label by name. */
export async function removeLabel(
  owner: string,
  repo: string,
  prNumber: number,
  label: string,
  token: string
): Promise<unknown> {
  return ghRequest(
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels/${encodeURIComponent(label)}`,
    { method: 'DELETE', token }
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
            comments?: { nodes?: Array<{ author?: { login?: string }; bodyText?: string; url?: string }> }
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

// Tauri backend GitHub integration wrappers
import {
  githubDeviceCode,
  githubPollToken,
  githubGetUser,
  githubListRepos,
  githubCommitAvatars,
} from '../lib/tauri'

export async function apiGithubDeviceCode(scope: string) {
  return githubDeviceCode(scope)
}

export async function apiGithubPollToken(deviceCode: string) {
  return githubPollToken(deviceCode)
}

export async function apiGithubGetUser(token: string) {
  return githubGetUser(token)
}

export async function apiGithubListRepos(token: string) {
  return githubListRepos(token)
}

/** Resolves `sha → avatar URL` for the given commit SHAs (unresolved SHAs are absent). */
export async function apiGithubCommitAvatars(
  token: string,
  owner: string,
  repo: string,
  shas: string[]
): Promise<Record<string, string>> {
  return githubCommitAvatars(token, owner, repo, shas)
}
