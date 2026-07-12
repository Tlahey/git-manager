import type { MockPR, MockIssue, DayCommit, PRStatus } from '../app/pull-requests/types'

export interface GhUser {
  login: string
  avatar_url: string
}

export interface GhLabel {
  name: string
}

export interface GhRawPR {
  number: number
  title: string
  body?: string | null
  html_url: string
  state: string
  draft: boolean
  merged_at: string | null
  user?: GhUser
  requested_reviewers?: GhUser[]
  labels?: GhLabel[]
  changed_files?: number
  additions?: number
  deletions?: number
  created_at: string
  updated_at: string
  comments?: number
  base?: { ref?: string; repo?: { name?: string; html_url?: string; full_name?: string } }
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

async function ghFetch<T>(url: string, token?: string): Promise<T> {
  const res = await fetch(url, { headers: ghHeaders(token) })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  return res.json()
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

// Tauri backend GitHub integration wrappers
import { githubDeviceCode, githubPollToken, githubGetUser, githubListRepos } from '../lib/tauri'

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
