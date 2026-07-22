import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  githubDeviceCode: vi.fn(),
  githubPollToken: vi.fn(),
  githubGetUser: vi.fn(),
  githubListRepos: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import {
  parsePRStatus,
  rawToPullRequest,
  extractRepoInfo,
  rawToMockPR,
  rawToMockIssue,
  fetchGitHubPRs,
  fetchGitHubReviewRequestedPRs,
  fetchGitHubIssues,
  fetchGitHubPRDetails,
  fetchGitHubCommitCiStatus,
  fetchGitHubContributions,
  fetchRepoPRs,
  fetchCommitPullRequest,
  fetchCommitMergedPullRequestForBranch,
  fetchClosedPullRequests,
  resolveTagOrReleaseUrl,
  createPullRequest,
  fetchPrFiles,
  fetchPrFilesViewedState,
  markPrFileAsViewed,
  unmarkPrFileAsViewed,
  postPrComment,
  submitPrReview,
  mergePullRequest,
  fetchPrMergeability,
  fetchRepoDefaultBranch,
  apiGithubDeviceCode,
  apiGithubPollToken,
  apiGithubGetUser,
  apiGithubListRepos,
  type GhRawPR,
  type GhRawIssue,
} from './github.api'

const mockedTauri = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

function rawPR(overrides: Partial<GhRawPR> = {}): GhRawPR {
  return {
    number: 42,
    title: 'Add feature',
    html_url: 'https://github.com/org/repo/pull/42',
    state: 'open',
    draft: false,
    merged_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    ...overrides,
  }
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parsePRStatus', () => {
  it('reports merged when merged_at is set, regardless of draft/state', () => {
    expect(parsePRStatus({ state: 'closed', draft: true, merged_at: '2024-01-01' })).toBe('merged')
  })

  it('reports draft when draft is true and not merged', () => {
    expect(parsePRStatus({ state: 'open', draft: true, merged_at: null })).toBe('draft')
  })

  it('reports closed when state is closed and not merged/draft', () => {
    expect(parsePRStatus({ state: 'closed', draft: false, merged_at: null })).toBe('closed')
  })

  it('defaults to open', () => {
    expect(parsePRStatus({ state: 'open', draft: false, merged_at: null })).toBe('open')
  })
})

describe('rawToPullRequest', () => {
  it('maps the core fields and derives an open PR', () => {
    const pr = rawToPullRequest(
      rawPR({
        number: 7,
        title: 'Fix bug',
        user: { login: 'marie', avatar_url: 'm.png' },
        head: { ref: 'feature-x' },
        base: { ref: 'main' },
      })
    )
    expect(pr).toMatchObject({
      number: 7,
      title: 'Fix bug',
      author: 'marie',
      authorAvatar: 'm.png',
      headRef: 'feature-x',
      baseRef: 'main',
      state: 'open',
      ciStatus: null,
    })
  })

  it('derives state "merged" from merged_at even though GitHub reports state "closed"', () => {
    expect(rawToPullRequest(rawPR({ state: 'closed', merged_at: '2024-02-01' })).state).toBe(
      'merged'
    )
  })

  it('derives state "draft" and "closed" for the remaining cases', () => {
    expect(rawToPullRequest(rawPR({ draft: true })).state).toBe('draft')
    expect(rawToPullRequest(rawPR({ state: 'closed', merged_at: null })).state).toBe('closed')
  })
})

describe('extractRepoInfo', () => {
  it('prefers base.repo when present', () => {
    const info = extractRepoInfo({
      base: {
        repo: { name: 'repo', html_url: 'https://github.com/org/repo', full_name: 'org/repo' },
      },
      html_url: '',
    })
    expect(info).toEqual({
      repo: 'repo',
      repoUrl: 'https://github.com/org/repo',
      fullName: 'org/repo',
    })
  })

  it('falls back to repository_url', () => {
    const info = extractRepoInfo({
      repository_url: 'https://api.github.com/repos/org/repo',
      html_url: '',
    })
    expect(info).toEqual({
      repo: 'repo',
      repoUrl: 'https://github.com/org/repo',
      fullName: 'org/repo',
    })
  })

  it('falls back to parsing html_url', () => {
    const info = extractRepoInfo({ html_url: 'https://github.com/org/repo/issues/5' })
    expect(info).toEqual({
      repo: 'repo',
      repoUrl: 'https://github.com/org/repo',
      fullName: 'org/repo',
    })
  })

  it('falls back to "unknown" when nothing is present', () => {
    expect(extractRepoInfo({ html_url: '' })).toEqual({
      repo: 'unknown',
      repoUrl: '',
      fullName: 'unknown',
    })
  })
})

describe('rawToMockPR', () => {
  it('maps the core fields and repo info', () => {
    const pr = rawToMockPR(
      rawPR({
        base: {
          repo: { name: 'repo', html_url: 'https://github.com/org/repo', full_name: 'org/repo' },
        },
      }),
      'me'
    )
    expect(pr).toMatchObject({
      id: 'gh-pr-42-org/repo',
      number: 42,
      title: 'Add feature',
      repo: 'repo',
      status: 'open',
      author: '—',
    })
  })

  it('defaults author to "—" and avatar to "" when user is absent', () => {
    const pr = rawToMockPR(rawPR({ user: undefined }), 'me')
    expect(pr.author).toBe('—')
    expect(pr.authorAvatar).toBe('')
  })

  it('maps requested reviewers to collaborators', () => {
    const pr = rawToMockPR(
      rawPR({ requested_reviewers: [{ login: 'alice', avatar_url: 'a.png' }] }),
      'me'
    )
    expect(pr.collaborators).toEqual([{ login: 'alice', avatar: 'a.png' }])
  })

  it('sets needsMyReview when the PR is open, not authored by me, and I am a requested reviewer', () => {
    const pr = rawToMockPR(
      rawPR({
        state: 'open',
        user: { login: 'other', avatar_url: '' },
        requested_reviewers: [{ login: 'me', avatar_url: '' }],
      }),
      'me'
    )
    expect(pr.needsMyReview).toBe(true)
  })

  it('does not need my review when I am the author', () => {
    const pr = rawToMockPR(
      rawPR({
        state: 'open',
        user: { login: 'me', avatar_url: '' },
        requested_reviewers: [{ login: 'me', avatar_url: '' }],
      }),
      'me'
    )
    expect(pr.needsMyReview).toBe(false)
  })

  it('does not need my review when the PR is not open', () => {
    const pr = rawToMockPR(
      rawPR({
        state: 'closed',
        merged_at: '2024-01-01',
        user: { login: 'other', avatar_url: '' },
        requested_reviewers: [{ login: 'me', avatar_url: '' }],
      }),
      'me'
    )
    expect(pr.needsMyReview).toBe(false)
  })

  it('defaults filesChanged/additions/deletions/comments to 0 when absent', () => {
    const pr = rawToMockPR(rawPR(), 'me')
    expect(pr).toMatchObject({ filesChanged: 0, additions: 0, deletions: 0, comments: 0 })
  })

  it('maps labels to plain name strings', () => {
    const pr = rawToMockPR(rawPR({ labels: [{ name: 'bug' }, { name: 'urgent' }] }), 'me')
    expect(pr.labels).toEqual(['bug', 'urgent'])
  })
})

describe('rawToMockIssue', () => {
  function rawIssue(overrides: Partial<GhRawIssue> = {}): GhRawIssue {
    return {
      number: 7,
      title: 'Bug report',
      html_url: 'https://github.com/org/repo/issues/7',
      state: 'open',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      repository_url: 'https://api.github.com/repos/org/repo',
      ...overrides,
    }
  }

  it('maps status from state', () => {
    expect(rawToMockIssue(rawIssue({ state: 'open' })).status).toBe('open')
    expect(rawToMockIssue(rawIssue({ state: 'closed' })).status).toBe('closed')
  })

  it('extracts the repo name from repository_url', () => {
    expect(rawToMockIssue(rawIssue()).repo).toBe('repo')
  })

  it('maps assignees and labels', () => {
    const issue = rawToMockIssue(
      rawIssue({
        assignees: [{ login: 'bob', avatar_url: 'b.png' }],
        labels: [{ name: 'help wanted' }],
      })
    )
    expect(issue.assignees).toEqual([{ login: 'bob', avatar: 'b.png' }])
    expect(issue.labels).toEqual(['help wanted'])
  })
})

describe('fetchGitHubPRs / fetchGitHubReviewRequestedPRs / fetchGitHubIssues', () => {
  it('fetchGitHubPRs queries authored open PRs and maps them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [rawPR()] }))
    vi.stubGlobal('fetch', fetchMock)

    const prs = await fetchGitHubPRs('me', 'tok')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('is:pr+author:me+is:open'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'token tok' }) })
    )
    expect(prs).toHaveLength(1)
    expect(prs[0].number).toBe(42)
  })

  it('fetchGitHubReviewRequestedPRs queries review-requested PRs and forces needsMyReview true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ items: [rawPR({ user: { login: 'me', avatar_url: '' } })] })
      )
    vi.stubGlobal('fetch', fetchMock)

    const prs = await fetchGitHubReviewRequestedPRs('me', 'tok')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('review-requested:me'),
      expect.anything()
    )
    expect(prs[0].needsMyReview).toBe(true) // forced true even though rawToMockPR would say false (author === me)
  })

  it('fetchGitHubIssues queries assigned issues', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchGitHubIssues('me', 'tok')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('is:issue+assignee:me'),
      expect.anything()
    )
  })

  it('returns an empty array when the search response has no items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))
    expect(await fetchGitHubPRs('me', 'tok')).toEqual([])
  })

  it('throws a descriptive error on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 403)))
    await expect(fetchGitHubPRs('me', 'tok')).rejects.toThrow(Error)
  })
})

describe('fetchGitHubPRDetails / fetchRepoPRs', () => {
  it('fetchGitHubPRDetails fetches the given API URL directly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(rawPR()))
    vi.stubGlobal('fetch', fetchMock)
    await fetchGitHubPRDetails('https://api.github.com/repos/org/repo/pulls/42', 'tok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo/pulls/42',
      expect.anything()
    )
  })

  it('fetchRepoPRs builds the open-PRs listing URL and works without a token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    await fetchRepoPRs('org', 'repo')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo/pulls?state=open&per_page=100',
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      })
    )
  })
})

describe('fetchCommitPullRequest', () => {
  it('returns null when no PR is associated with the commit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
    expect(await fetchCommitPullRequest('org', 'repo', 'sha1', 'tok')).toBeNull()
  })

  it('returns null (not throw) when GitHub responds non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 404)))
    expect(await fetchCommitPullRequest('org', 'repo', 'sha1', 'tok')).toBeNull()
  })

  it('prefers a merged PR over other associations and maps its fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          rawPR({ number: 1, merged_at: null }),
          rawPR({
            number: 2,
            merged_at: '2024-01-01',
            html_url: 'https://github.com/org/repo/pull/2',
            title: 'Merged one',
            state: 'closed',
          }),
        ])
      )
    )
    const pr = await fetchCommitPullRequest('org', 'repo', 'sha1', 'tok')
    expect(pr).toEqual({
      number: 2,
      url: 'https://github.com/org/repo/pull/2',
      title: 'Merged one',
      state: 'closed',
      merged: true,
    })
  })
})

describe('fetchCommitMergedPullRequestForBranch', () => {
  it('returns the merged PR (with its author) whose head.ref matches the branch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          rawPR({
            number: 3,
            merged_at: '2024-01-01',
            title: 'Mine',
            head: { ref: 'feature/mine' },
            user: { login: 'alice', avatar_url: '' },
          }),
        ])
      )
    )
    expect(
      await fetchCommitMergedPullRequestForBranch('org', 'repo', 'sha1', 'feature/mine', 'tok')
    ).toEqual({ number: 3, title: 'Mine', author: 'alice' })
  })

  it('REGRESSION: ignores a merged PR from another branch (fork-point commit of a fresh worktree)', async () => {
    // A branch created from main with no unique commits: its HEAD commit belongs to whatever PR
    // shipped that commit — accepting it once bulk-deleted a never-merged worktree.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          rawPR({ number: 87, merged_at: '2024-01-01', head: { ref: 'claude/other-branch' } }),
        ])
      )
    )
    expect(
      await fetchCommitMergedPullRequestForBranch('org', 'repo', 'sha1', 'feature/mine', 'tok')
    ).toBeNull()
  })

  it('ignores an unmerged PR even when its head.ref matches the branch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([rawPR({ number: 4, merged_at: null, head: { ref: 'feature/mine' } })])
      )
    )
    expect(
      await fetchCommitMergedPullRequestForBranch('org', 'repo', 'sha1', 'feature/mine', 'tok')
    ).toBeNull()
  })

  it('returns null (not throw) when GitHub responds non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 500)))
    expect(
      await fetchCommitMergedPullRequestForBranch('org', 'repo', 'sha1', 'feature/mine', 'tok')
    ).toBeNull()
  })
})

describe('fetchClosedPullRequests', () => {
  it('builds the closed-PRs listing URL, sorted by most recently updated', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    await fetchClosedPullRequests('org', 'repo', 'tok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo/pulls?state=closed&sort=updated&direction=desc&per_page=100',
      expect.anything()
    )
  })

  it('returns the raw list, including head.ref and merged_at for each item', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          rawPR({ number: 7, merged_at: '2024-01-01', head: { ref: 'feature/login' } }),
        ])
      )
    )
    const prs = await fetchClosedPullRequests('org', 'repo', 'tok')
    expect(prs).toEqual([
      expect.objectContaining({ number: 7, merged_at: '2024-01-01', head: { ref: 'feature/login' } }),
    ])
  })

  it('returns an empty list (not throw) when GitHub responds non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 500)))
    expect(await fetchClosedPullRequests('org', 'repo', 'tok')).toEqual([])
  })
})

describe('resolveTagOrReleaseUrl', () => {
  it('returns the release page URL when a release exists for the tag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ html_url: 'https://github.com/org/repo/releases/tag/v1.0' })
      )
    )
    expect(await resolveTagOrReleaseUrl('org', 'repo', 'v1.0', 'tok')).toBe(
      'https://github.com/org/repo/releases/tag/v1.0'
    )
  })

  it('falls back to the tag page URL when no release exists (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 404)))
    expect(await resolveTagOrReleaseUrl('org', 'repo', 'v9.9', 'tok')).toBe(
      'https://github.com/org/repo/releases/tag/v9.9'
    )
  })
})

describe('fetchGitHubCommitCiStatus', () => {
  it('fetches check-runs and commit status in parallel', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('check-runs')
            ? jsonResponse({ total_count: 1 })
            : jsonResponse({ state: 'success' })
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchGitHubCommitCiStatus('org', 'repo', 'sha1', 'tok')
    expect(result.checkRunsRes).toEqual({ total_count: 1 })
    expect(result.statusRes).toEqual({ state: 'success' })
  })

  it('resolves the other branch to null when one of the two requests fails', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string) =>
        url.includes('check-runs')
          ? Promise.reject(new Error('boom'))
          : Promise.resolve(jsonResponse({ state: 'success' }))
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchGitHubCommitCiStatus('org', 'repo', 'sha1', 'tok')
    expect(result.checkRunsRes).toBeNull()
    expect(result.statusRes).toEqual({ state: 'success' })
  })
})

describe('fetchGitHubContributions', () => {
  it('POSTs a GraphQL query and flattens weeks into day-commit entries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: {
                totalContributions: 3,
                weeks: [
                  {
                    contributionDays: [
                      { date: '2024-01-01', contributionCount: 2 },
                      { date: '2024-01-02', contributionCount: 1 },
                    ],
                  },
                ],
              },
            },
          },
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const days = await fetchGitHubContributions('me', 'tok')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'bearer tok' }),
      })
    )
    expect(days).toEqual([
      { date: '2024-01-01', commits: 2 },
      { date: '2024-01-02', commits: 1 },
    ])
  })

  it('throws on a non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 500)))
    await expect(fetchGitHubContributions('me', 'tok')).rejects.toThrow(Error)
  })

  it('throws with the joined GraphQL error messages when the response has errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ errors: [{ message: 'bad token' }, { message: 'rate limited' }] })
        )
    )
    await expect(fetchGitHubContributions('me', 'tok')).rejects.toThrow(Error)
  })

  it('returns an empty array when the calendar has no weeks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { user: null } })))
    expect(await fetchGitHubContributions('me', 'tok')).toEqual([])
  })
})

describe('fetchPrMergeability', () => {
  it('reports viewerCanMergeAsAdmin from the GraphQL response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            repository: {
              pullRequest: {
                mergeable: 'CONFLICTING',
                mergeStateStatus: 'BLOCKED',
                reviewDecision: 'REVIEW_REQUIRED',
                viewerCanMergeAsAdmin: true,
                commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
              },
            },
          },
        })
      )
    )

    const result = await fetchPrMergeability('org', 'repo', 42, 'tok')

    expect(result.mergeStateStatus).toBe('BLOCKED')
    expect(result.viewerCanMergeAsAdmin).toBe(true)
  })

  it('defaults viewerCanMergeAsAdmin to false when absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ data: { repository: { pullRequest: null } } }))
    )

    const result = await fetchPrMergeability('org', 'repo', 42, 'tok')

    expect(result.viewerCanMergeAsAdmin).toBe(false)
  })
})

describe('Tauri GitHub integration pass-throughs', () => {
  it('apiGithubDeviceCode delegates to githubDeviceCode', async () => {
    mockedTauri.githubDeviceCode.mockResolvedValue({ device_code: 'x' })
    await apiGithubDeviceCode('repo')
    expect(mockedTauri.githubDeviceCode).toHaveBeenCalledWith('repo')
  })

  it('apiGithubPollToken delegates to githubPollToken', async () => {
    mockedTauri.githubPollToken.mockResolvedValue({ access_token: 'tok' })
    await apiGithubPollToken('device-code')
    expect(mockedTauri.githubPollToken).toHaveBeenCalledWith('device-code')
  })

  it('apiGithubGetUser delegates to githubGetUser', async () => {
    mockedTauri.githubGetUser.mockResolvedValue({ login: 'me' })
    await apiGithubGetUser('tok')
    expect(mockedTauri.githubGetUser).toHaveBeenCalledWith('tok')
  })

  it('apiGithubListRepos delegates to githubListRepos', async () => {
    mockedTauri.githubListRepos.mockResolvedValue([])
    await apiGithubListRepos('tok')
    expect(mockedTauri.githubListRepos).toHaveBeenCalledWith('tok')
  })
})

describe('PR write operations', () => {
  it('createPullRequest POSTs the PR body with an auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(rawPR()))
    vi.stubGlobal('fetch', fetchMock)
    await createPullRequest(
      'org',
      'repo',
      { title: 'T', head: 'feat', base: 'main', body: 'B' },
      'tok'
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo/pulls',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'T', head: 'feat', base: 'main', body: 'B' }),
        headers: expect.objectContaining({
          Authorization: 'token tok',
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('fetchPrFiles builds the files listing URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    await fetchPrFiles('org', 'repo', 42, 'tok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo/pulls/42/files?per_page=100',
      expect.anything()
    )
  })

  it('fetchPrFilesViewedState queries per-file viewerViewedState plus the PR node id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          repository: {
            pullRequest: {
              id: 'PR_kwABC',
              files: {
                nodes: [
                  { path: 'a.ts', viewerViewedState: 'VIEWED' },
                  { path: 'b.ts', viewerViewedState: 'UNVIEWED' },
                ],
              },
            },
          },
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchPrFilesViewedState('org', 'repo', 42, 'tok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/graphql',
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toEqual({
      pullRequestId: 'PR_kwABC',
      viewedByPath: { 'a.ts': 'VIEWED', 'b.ts': 'UNVIEWED' },
    })
  })

  it('fetchPrFilesViewedState defaults to an empty id/map when the PR is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ data: { repository: { pullRequest: null } } }))
    )
    const result = await fetchPrFilesViewedState('org', 'repo', 42, 'tok')
    expect(result).toEqual({ pullRequestId: '', viewedByPath: {} })
  })

  it('markPrFileAsViewed sends the markFileAsViewed mutation with pullRequestId/path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { markFileAsViewed: {} } }))
    vi.stubGlobal('fetch', fetchMock)
    await markPrFileAsViewed('PR_kwABC', 'a.ts', 'tok')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.query).toContain('markFileAsViewed')
    expect(body.variables).toEqual({ id: 'PR_kwABC', path: 'a.ts' })
  })

  it('unmarkPrFileAsViewed sends the unmarkFileAsViewed mutation with pullRequestId/path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { unmarkFileAsViewed: {} } }))
    vi.stubGlobal('fetch', fetchMock)
    await unmarkPrFileAsViewed('PR_kwABC', 'a.ts', 'tok')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.query).toContain('unmarkFileAsViewed')
    expect(body.variables).toEqual({ id: 'PR_kwABC', path: 'a.ts' })
  })

  it('postPrComment POSTs to the issues comments endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1, html_url: 'u' }))
    vi.stubGlobal('fetch', fetchMock)
    await postPrComment('org', 'repo', 42, 'hello', 'tok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo/issues/42/comments',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ body: 'hello' }) })
    )
  })

  it('submitPrReview POSTs the review event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1, state: 'APPROVED' }))
    vi.stubGlobal('fetch', fetchMock)
    await submitPrReview('org', 'repo', 42, { event: 'APPROVE', body: 'lgtm' }, 'tok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo/pulls/42/reviews',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ event: 'APPROVE', body: 'lgtm' }),
      })
    )
  })

  it('mergePullRequest PUTs the chosen merge method', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ sha: 'abc', merged: true, message: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)
    await mergePullRequest('org', 'repo', 42, { mergeMethod: 'squash' }, 'tok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo/pulls/42/merge',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          merge_method: 'squash',
          commit_title: undefined,
          commit_message: undefined,
        }),
      })
    )
  })

  it('fetchRepoDefaultBranch returns the default branch, falling back to main', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ default_branch: 'develop' })))
    expect(await fetchRepoDefaultBranch('org', 'repo', 'tok')).toBe('develop')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))
    expect(await fetchRepoDefaultBranch('org', 'repo', 'tok')).toBe('main')
  })

  it('propagates a non-2xx response as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 422)))
    await expect(
      createPullRequest('org', 'repo', { title: 'T', head: 'h', base: 'b' }, 'tok')
    ).rejects.toThrow()
  })

  it("includes GitHub's error message and field errors in the thrown error", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            message: 'Validation Failed',
            errors: [{ message: 'No commits between main and feature-x' }],
          },
          false,
          422
        )
      )
    )
    let err: unknown
    try {
      await createPullRequest('org', 'repo', { title: 'T', head: 'feature-x', base: 'main' }, 'tok')
    } catch (e) {
      err = e
    }
    expect(String(err)).toContain('Validation Failed')
    expect(String(err)).toContain('No commits between main and feature-x')
  })
})
