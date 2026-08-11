import type { MockIssue } from '../../lib/github/types'
import {
  type GhUser,
  type GhLabel,
  type GhSearchResult,
  ghFetch,
  ghRequest,
} from './githubApiShared'

export interface GhRawIssue {
  number: number
  title: string
  body?: string | null
  repository_url?: string
  html_url: string
  state: string
  user?: GhUser
  assignees?: GhUser[]
  labels?: GhLabel[]
  created_at: string
  updated_at: string
  comments?: number
  reactions?: { '+1'?: number }
}

export function rawToMockIssue(raw: GhRawIssue): MockIssue {
  return {
    id: `gh-issue-${raw.number}-${raw.repository_url?.split('/repos/')[1] ?? ''}`,
    number: raw.number,
    title: raw.title,
    // Normalized to `undefined`: GitHub sends `null` for a body-less issue, and the preview treats
    // "no description" as one case rather than two.
    body: raw.body ?? undefined,
    repo: raw.repository_url?.split('/').slice(-1)[0] ?? 'unknown',
    fullName: raw.repository_url?.split('/repos/')[1],
    url: raw.html_url,
    status: raw.state === 'open' ? 'open' : 'closed',
    author: raw.user?.login ?? '—',
    authorAvatar: raw.user?.avatar_url ?? '',
    assignees: (raw.assignees ?? []).map((a) => ({ login: a.login, avatar: a.avatar_url })),
    labels: (raw.labels ?? []).map((l) => l.name),
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
    comments: raw.comments ?? 0,
    thumbsUp: raw.reactions?.['+1'] ?? 0,
  }
}

/**
 * Issues across a set of repositories (the projects added to the app), newest first — not scoped to
 * a single user. Uses one search query with an OR'd list of `repo:` qualifiers so every added repo's
 * issues arrive in a single request; `is:issue` keeps pull requests (which GitHub also models as
 * issues) out. Returns `[]` for an empty repo list rather than issuing a match-everything search.
 */
export async function fetchGitHubRepoIssues(
  repos: { owner: string; repo: string }[],
  accountId: string
): Promise<MockIssue[]> {
  if (repos.length === 0) return []
  const repoQualifiers = repos.map((r) => `repo:${r.owner}/${r.repo}`).join('+')
  const data = await ghFetch<GhSearchResult<GhRawIssue>>(
    `https://api.github.com/search/issues?q=is:issue+${repoQualifiers}&per_page=100&sort=updated`,
    accountId,
    // The squirrel-girl preview makes the search include each item's `reactions` summary, so the row
    // can show a 👍 count without a follow-up request per issue.
    'application/vnd.github.squirrel-girl-preview+json'
  )
  return (data.items ?? []).map(rawToMockIssue)
}

/**
 * Open issues of a single repository, newest first. Unlike {@link fetchGitHubRepoIssues} (which
 * searches across every repo added to the app) this hits the repo's own issues resource, so it
 * needs no search quota and works for a repo the user hasn't added to the Launchpad. `pulls=false`
 * isn't a real GitHub parameter — the endpoint returns PRs too, so they're filtered out here.
 */
export async function fetchRepoIssues(
  owner: string,
  repo: string,
  accountId?: string
): Promise<MockIssue[]> {
  const raw = await ghFetch<Array<GhRawIssue & { pull_request?: unknown }>>(
    `https://api.github.com/repos/${owner}/${repo}/issues?state=open&sort=updated&direction=desc&per_page=100`,
    accountId,
    'application/vnd.github.squirrel-girl-preview+json'
  )
  return raw
    .filter((item) => !item.pull_request)
    .map((item) => ({
      ...rawToMockIssue(item),
      // The repo issues endpoint has no `repository_url`, so `rawToMockIssue` can't derive these.
      repo,
      fullName: `${owner}/${repo}`,
    }))
}

/**
 * Issues of one repository matching a **raw GitHub issue-search query** — the sidebar's saved issue
 * filters (see `features/graph/stores/issueFilters.store.ts`).
 *
 * The query is whatever the user typed in their filter (`is:open assignee:@me`, `label:bug`, …) and
 * is passed to GitHub untouched, so every qualifier GitHub's own search box accepts works here,
 * including ones this app knows nothing about. Only `repo:` and `is:issue` are prepended: the filter
 * is always scoped to the open repository, and pull requests (which GitHub models as issues) never
 * belong in the Issues section.
 *
 * Unlike {@link fetchRepoIssues} this has to go through the search API — the repo's own issues
 * resource takes a fixed set of parameters and can't evaluate search syntax. That costs search
 * quota (30 requests/minute authenticated), which is why one filter is one request and the caller
 * fetches a whole filter list in a single batch rather than per row.
 */
export async function fetchIssuesByQuery(
  owner: string,
  repo: string,
  query: string,
  accountId?: string
): Promise<MockIssue[]> {
  const q = `repo:${owner}/${repo} is:issue ${query}`.trim()
  const data = await ghFetch<GhSearchResult<GhRawIssue>>(
    `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=100&sort=updated&order=desc`,
    accountId,
    'application/vnd.github.squirrel-girl-preview+json'
  )
  return (data.items ?? []).map((item) => ({
    ...rawToMockIssue(item),
    // Search results do carry `repository_url`, but spelling these out keeps a filter's issues
    // identical in shape to `fetchRepoIssues`' — both feed the same rows and hover cards.
    repo,
    fullName: `${owner}/${repo}`,
  }))
}

/** Open a new issue on a repository. Requires the token's `repo` scope. */
export async function createIssue(
  owner: string,
  repo: string,
  input: { title: string; body?: string },
  accountId: string
): Promise<GhRawIssue> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: { title: input.title, body: input.body ?? '' },
    accountId,
  })
}

/** Full details of one issue (adds the markdown `body` the search list omits). */
export async function fetchIssueDetail(
  owner: string,
  repo: string,
  issueNumber: number,
  accountId: string
): Promise<GhRawIssue> {
  return ghFetch<GhRawIssue>(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    accountId,
    'application/vnd.github.squirrel-girl-preview+json'
  )
}

/** Patch an issue's editable fields (title, body, and/or open/closed state) via
 * `PATCH /repos/{o}/{r}/issues/{n}`. Requires the token's `repo` scope. */
export async function updateIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  patch: { title?: string; body?: string; state?: 'open' | 'closed' },
  accountId: string
): Promise<GhRawIssue> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    body: patch,
    accountId,
  })
}

/** One comment on an issue, as GitHub returns it. */
export interface GhIssueComment {
  id: number
  body?: string | null
  user?: GhUser
  created_at: string
}

/**
 * An issue's comments — the board's discussion thread for a GitHub-backed card.
 *
 * Fetched per card, on demand, rather than alongside the board's issue list: a board with fifty
 * cards would otherwise cost fifty extra requests on every load, to show something only the opened
 * card's dialog displays. The issue list already carries a comment *count* for the card face.
 */
export async function fetchIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  accountId: string
): Promise<GhIssueComment[]> {
  return ghFetch<GhIssueComment[]>(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
    accountId
  )
}

export async function createIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  accountId: string
): Promise<GhIssueComment> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: { body },
    accountId,
  })
}

/** Close an issue (`state: 'closed'`) or reopen it (`state: 'open'`). Shares the issues REST resource
 * with labels/assignees; requires the token's `repo` scope. */
export async function setIssueState(
  owner: string,
  repo: string,
  issueNumber: number,
  state: 'open' | 'closed',
  accountId: string
): Promise<{ number: number; state: string }> {
  return ghRequest(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    body: { state },
    accountId,
  })
}
