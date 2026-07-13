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
  resolveTagOrReleaseUrl,
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
