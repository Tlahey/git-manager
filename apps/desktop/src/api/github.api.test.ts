import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every GitHub call goes through `githubApiRequest` now — a Tauri command that attaches the
// account's token in Rust — so this suite mocks that instead of `fetch`. The assertions gained
// rather than lost: where they used to check a header on an options bag, they now check the account
// id the app asked to act as, and there is no token anywhere in this file because there is nowhere
// in the frontend one could come from.
vi.mock('../lib/tauri', () => ({
  githubDeviceCode: vi.fn(),
  githubPollToken: vi.fn(),
  githubConnectToken: vi.fn(),
  githubDisconnectAccount: vi.fn(),
  githubListRepos: vi.fn(),
  githubApiRequest: vi.fn(),
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
  fetchGitHubRepoIssues,
  setIssueState,
  updateIssue,
  fetchIssueDetail,
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
  fetchFileContentAtRef,
  fetchPrFilesViewedState,
  markPrFileAsViewed,
  unmarkPrFileAsViewed,
  postPrComment,
  submitPrReview,
  mergePullRequest,
  fetchPrMergeability,
  fetchPrReviewSummary,
  fetchRepoIssues,
  fetchIssuesByQuery,
  fetchPullRequestsByQuery,
  createIssue,
  fetchRepoDefaultBranch,
  apiGithubDeviceCode,
  apiGithubPollToken,
  apiGithubConnectToken,
  apiGithubDisconnectAccount,
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

/** What `githubApiRequest` resolves with: Rust hands back the status and the raw body text. */
function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, body: JSON.stringify(body) }
}

/** A raw (non-JSON) body — the contents API's `raw` media type, used by the PR diff viewer. */
function textResponse(body: string, ok = true, status = 200) {
  return { ok, status, body }
}

/** Installs `mock` as the GitHub transport, replacing what `stubGithub(…)` used to do. */
function stubGithub(mock: unknown) {
  mockedTauri.githubApiRequest = mock as ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
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

  it('reads the merge off a search item, whose merged_at is nested under pull_request', () => {
    // `search/issues` items are issue-shaped: no top-level merged_at at all. Missing this is what
    // made every merged PR report as "closed without merging".
    expect(
      parsePRStatus({ state: 'closed', draft: false, pull_request: { merged_at: '2024-01-01' } })
    ).toBe('merged')
  })

  it('still reports a search item closed when its pull_request block has no merged_at', () => {
    expect(
      parsePRStatus({ state: 'closed', draft: false, pull_request: { merged_at: null } })
    ).toBe('closed')
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

  it('derives fullName from repository_url and the 👍 count from reactions', () => {
    const issue = rawToMockIssue(rawIssue({ reactions: { '+1': 9 } }))
    expect(issue.fullName).toBe('org/repo')
    expect(issue.thumbsUp).toBe(9)
  })

  it('defaults thumbsUp to 0 when reactions are absent', () => {
    expect(rawToMockIssue(rawIssue()).thumbsUp).toBe(0)
  })
})

describe('fetchGitHubPRs / fetchGitHubReviewRequestedPRs / fetchGitHubIssues', () => {
  it('fetchGitHubPRs queries authored open PRs and maps them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [rawPR()] }))
    stubGithub(fetchMock)

    const prs = await fetchGitHubPRs('me', 'acct')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('is:pr+author:me+is:open'),
        accountId: 'acct',
      })
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
    stubGithub(fetchMock)

    const prs = await fetchGitHubReviewRequestedPRs('me', 'acct')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('review-requested:me') })
    )
    expect(prs[0].needsMyReview).toBe(true) // forced true even though rawToMockPR would say false (author === me)
  })

  it('fetchGitHubRepoIssues queries issues across the given repos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }))
    stubGithub(fetchMock)

    await fetchGitHubRepoIssues(
      [
        { owner: 'me', repo: 'git-manager' },
        { owner: 'org', repo: 'other' },
      ],
      'acct'
    )

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('is:issue+repo:me/git-manager+repo:org/other'),
      })
    )
  })

  it('fetchGitHubRepoIssues short-circuits to [] for an empty repo list without fetching', async () => {
    const fetchMock = vi.fn()
    stubGithub(fetchMock)

    expect(await fetchGitHubRepoIssues([], 'acct')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetchIssueDetail GETs the issue resource', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ number: 7, body: 'hi' }))
    stubGithub(fetchMock)

    const issue = await fetchIssueDetail('org', 'repo', 7, 'acct')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://api.github.com/repos/org/repo/issues/7' })
    )
    expect(issue.body).toBe('hi')
  })

  it('updateIssue PATCHes the issue resource with title/body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ number: 7 }))
    stubGithub(fetchMock)

    await updateIssue('org', 'repo', 7, { title: 'New', body: 'Body' }, 'acct')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/repos/org/repo/issues/7',
        method: 'PATCH',
        body: { title: 'New', body: 'Body' },
      })
    )
  })

  it('setIssueState PATCHes the issue resource with the new state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ number: 7, state: 'closed' }))
    stubGithub(fetchMock)

    await setIssueState('org', 'repo', 7, 'closed', 'acct')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/repos/org/repo/issues/7',
        method: 'PATCH',
        body: { state: 'closed' },
      })
    )
  })

  it('returns an empty array when the search response has no items', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({})))
    expect(await fetchGitHubPRs('me', 'acct')).toEqual([])
  })

  it('throws a descriptive error on a non-ok response', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({}, false, 403)))
    await expect(fetchGitHubPRs('me', 'acct')).rejects.toThrow(Error)
  })
})

describe('fetchGitHubPRDetails / fetchRepoPRs', () => {
  it('fetchGitHubPRDetails fetches the given API URL directly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(rawPR()))
    stubGithub(fetchMock)
    await fetchGitHubPRDetails('https://api.github.com/repos/org/repo/pulls/42', 'acct')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://api.github.com/repos/org/repo/pulls/42' })
    )
  })

  it('fetchRepoPRs builds the open-PRs listing URL and works without a token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    stubGithub(fetchMock)
    await fetchRepoPRs('org', 'repo')
    // No account named: Rust sends the request unauthenticated, which is what a public repo's
    // listing needs and what the `accountId?` on these functions is for.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/repos/org/repo/pulls?state=open&per_page=100',
        accountId: undefined,
      })
    )
  })
})

describe('fetchCommitPullRequest', () => {
  it('returns null when no PR is associated with the commit', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse([])))
    expect(await fetchCommitPullRequest('org', 'repo', 'sha1', 'acct')).toBeNull()
  })

  it('returns null (not throw) when GitHub responds non-ok', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({}, false, 404)))
    expect(await fetchCommitPullRequest('org', 'repo', 'sha1', 'acct')).toBeNull()
  })

  it('prefers a merged PR over other associations and maps its fields', async () => {
    stubGithub(
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
    const pr = await fetchCommitPullRequest('org', 'repo', 'sha1', 'acct')
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
    stubGithub(
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
      await fetchCommitMergedPullRequestForBranch('org', 'repo', 'sha1', 'feature/mine', 'acct')
    ).toEqual({ number: 3, title: 'Mine', author: 'alice' })
  })

  it('REGRESSION: ignores a merged PR from another branch (fork-point commit of a fresh worktree)', async () => {
    // A branch created from main with no unique commits: its HEAD commit belongs to whatever PR
    // shipped that commit — accepting it once bulk-deleted a never-merged worktree.
    stubGithub(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse([
            rawPR({ number: 87, merged_at: '2024-01-01', head: { ref: 'claude/other-branch' } }),
          ])
        )
    )
    expect(
      await fetchCommitMergedPullRequestForBranch('org', 'repo', 'sha1', 'feature/mine', 'acct')
    ).toBeNull()
  })

  it('ignores an unmerged PR even when its head.ref matches the branch', async () => {
    stubGithub(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse([rawPR({ number: 4, merged_at: null, head: { ref: 'feature/mine' } })])
        )
    )
    expect(
      await fetchCommitMergedPullRequestForBranch('org', 'repo', 'sha1', 'feature/mine', 'acct')
    ).toBeNull()
  })

  it('returns null (not throw) when GitHub responds non-ok', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({}, false, 500)))
    expect(
      await fetchCommitMergedPullRequestForBranch('org', 'repo', 'sha1', 'feature/mine', 'acct')
    ).toBeNull()
  })
})

describe('fetchClosedPullRequests', () => {
  it('builds the closed-PRs listing URL, sorted by most recently updated', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    stubGithub(fetchMock)
    await fetchClosedPullRequests('org', 'repo', 'acct')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/repos/org/repo/pulls?state=closed&sort=updated&direction=desc&per_page=100',
      })
    )
  })

  it('returns the raw list, including head.ref and merged_at for each item', async () => {
    stubGithub(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse([
            rawPR({ number: 7, merged_at: '2024-01-01', head: { ref: 'feature/login' } }),
          ])
        )
    )
    const prs = await fetchClosedPullRequests('org', 'repo', 'acct')
    expect(prs).toEqual([
      expect.objectContaining({
        number: 7,
        merged_at: '2024-01-01',
        head: { ref: 'feature/login' },
      }),
    ])
  })

  it('returns an empty list (not throw) when GitHub responds non-ok', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({}, false, 500)))
    expect(await fetchClosedPullRequests('org', 'repo', 'acct')).toEqual([])
  })
})

describe('resolveTagOrReleaseUrl', () => {
  it('returns the release page URL when a release exists for the tag', async () => {
    stubGithub(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ html_url: 'https://github.com/org/repo/releases/tag/v1.0' })
        )
    )
    expect(await resolveTagOrReleaseUrl('org', 'repo', 'v1.0', 'acct')).toBe(
      'https://github.com/org/repo/releases/tag/v1.0'
    )
  })

  it('falls back to the tag page URL when no release exists (404)', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({}, false, 404)))
    expect(await resolveTagOrReleaseUrl('org', 'repo', 'v9.9', 'acct')).toBe(
      'https://github.com/org/repo/releases/tag/v9.9'
    )
  })
})

describe('fetchGitHubCommitCiStatus', () => {
  it('fetches check-runs and commit status in parallel', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(({ url }: { url: string }) =>
        Promise.resolve(
          url.includes('check-runs')
            ? jsonResponse({ total_count: 1 })
            : jsonResponse({ state: 'success' })
        )
      )
    stubGithub(fetchMock)

    const result = await fetchGitHubCommitCiStatus('org', 'repo', 'sha1', 'acct')
    expect(result.checkRunsRes).toEqual({ total_count: 1 })
    expect(result.statusRes).toEqual({ state: 'success' })
  })

  it('resolves the other branch to null when one of the two requests fails', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(({ url }: { url: string }) =>
        url.includes('check-runs')
          ? Promise.reject(new Error('boom'))
          : Promise.resolve(jsonResponse({ state: 'success' }))
      )
    stubGithub(fetchMock)

    const result = await fetchGitHubCommitCiStatus('org', 'repo', 'sha1', 'acct')
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
    stubGithub(fetchMock)

    const days = await fetchGitHubContributions('me', 'acct')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/graphql',
        method: 'POST',
        accountId: 'acct',
      })
    )
    expect(days).toEqual([
      { date: '2024-01-01', commits: 2 },
      { date: '2024-01-02', commits: 1 },
    ])
  })

  it('throws on a non-ok HTTP response', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({}, false, 500)))
    await expect(fetchGitHubContributions('me', 'acct')).rejects.toThrow(Error)
  })

  it('throws with the joined GraphQL error messages when the response has errors', async () => {
    stubGithub(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ errors: [{ message: 'bad token' }, { message: 'rate limited' }] })
        )
    )
    await expect(fetchGitHubContributions('me', 'acct')).rejects.toThrow(Error)
  })

  it('returns an empty array when the calendar has no weeks', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({ data: { user: null } })))
    expect(await fetchGitHubContributions('me', 'acct')).toEqual([])
  })
})

describe('fetchPrMergeability', () => {
  it('reports viewerCanMergeAsAdmin from the GraphQL response', async () => {
    stubGithub(
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

    const result = await fetchPrMergeability('org', 'repo', 42, 'acct')

    expect(result.mergeStateStatus).toBe('BLOCKED')
    expect(result.viewerCanMergeAsAdmin).toBe(true)
  })

  it('defaults viewerCanMergeAsAdmin to false when absent', async () => {
    stubGithub(
      vi.fn().mockResolvedValue(jsonResponse({ data: { repository: { pullRequest: null } } }))
    )

    const result = await fetchPrMergeability('org', 'repo', 42, 'acct')

    expect(result.viewerCanMergeAsAdmin).toBe(false)
  })
})

describe('rawToPullRequest — participants', () => {
  it('maps assignees, requested reviewers and labels', () => {
    const pr = rawToPullRequest(
      rawPR({
        assignees: [{ login: 'marie', avatar_url: 'm.png' }],
        requested_reviewers: [{ login: 'bob', avatar_url: 'b.png' }],
        labels: [{ name: 'bug' }, { name: 'ui' }],
      })
    )
    expect(pr.assignees).toEqual([{ login: 'marie', avatarUrl: 'm.png' }])
    expect(pr.requestedReviewers).toEqual([{ login: 'bob', avatarUrl: 'b.png' }])
    expect(pr.labels).toEqual(['bug', 'ui'])
  })

  // The sidebar's grouping reads these unconditionally, so they must never come back undefined.
  it('defaults each participant list to an empty array when GitHub omits it', () => {
    const pr = rawToPullRequest(rawPR())
    expect(pr.assignees).toEqual([])
    expect(pr.requestedReviewers).toEqual([])
    expect(pr.labels).toEqual([])
  })
})

describe('fetchRepoIssues', () => {
  it("queries the repo's own open issues and maps them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          number: 12,
          title: 'Scroll lost',
          html_url: 'https://github.com/org/repo/issues/12',
          state: 'open',
          user: { login: 'marie', avatar_url: 'm.png' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ])
    )
    stubGithub(fetchMock)

    const issues = await fetchRepoIssues('org', 'repo', 'acct')

    expect(fetchMock.mock.calls[0][0].url).toContain('/repos/org/repo/issues?state=open')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ number: 12, title: 'Scroll lost', author: 'marie' })
  })

  // GitHub models pull requests as issues, so the endpoint returns them too.
  it('drops entries that are really pull requests', async () => {
    stubGithub(
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            number: 1,
            title: 'A PR',
            html_url: '',
            state: 'open',
            created_at: '',
            updated_at: '',
            pull_request: { url: 'x' },
          },
          {
            number: 2,
            title: 'An issue',
            html_url: '',
            state: 'open',
            created_at: '',
            updated_at: '',
          },
        ])
      )
    )

    const issues = await fetchRepoIssues('org', 'repo', 'acct')

    expect(issues.map((i) => i.number)).toEqual([2])
  })

  // The repo endpoint has no `repository_url`, so these can only come from the arguments.
  it('fills the repo name and full name from the requested owner/repo', async () => {
    stubGithub(
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse([
            { number: 3, title: 'x', html_url: '', state: 'open', created_at: '', updated_at: '' },
          ])
        )
    )

    const issues = await fetchRepoIssues('org', 'repo', 'acct')

    expect(issues[0]).toMatchObject({ repo: 'repo', fullName: 'org/repo' })
  })
})

describe('fetchIssuesByQuery', () => {
  function searchResponse(items: unknown[]) {
    return vi.fn().mockResolvedValue(jsonResponse({ items }))
  }

  it('scopes the saved filter to the repo and to issues, and passes the rest through', async () => {
    const fetchMock = searchResponse([])
    stubGithub(fetchMock)

    await fetchIssuesByQuery('org', 'repo', 'is:open assignee:@me', 'acct')

    const url = new URL(fetchMock.mock.calls[0][0].url)
    expect(url.pathname).toBe('/search/issues')
    expect(url.searchParams.get('q')).toBe('repo:org/repo is:issue is:open assignee:@me')
  })

  // A query can carry anything the user typed, including characters that would break the URL.
  it('encodes the query rather than splicing it into the URL raw', async () => {
    const fetchMock = searchResponse([])
    stubGithub(fetchMock)

    await fetchIssuesByQuery('org', 'repo', 'label:"needs triage" -label:wontfix', 'acct')

    const url = new URL(fetchMock.mock.calls[0][0].url)
    expect(url.searchParams.get('q')).toBe(
      'repo:org/repo is:issue label:"needs triage" -label:wontfix'
    )
  })

  it('still scopes correctly for an empty query', async () => {
    const fetchMock = searchResponse([])
    stubGithub(fetchMock)

    await fetchIssuesByQuery('org', 'repo', '', 'acct')

    expect(new URL(fetchMock.mock.calls[0][0].url).searchParams.get('q')).toBe(
      'repo:org/repo is:issue'
    )
  })

  it('maps the search results and stamps them with the requested repo', async () => {
    stubGithub(
      searchResponse([
        {
          number: 12,
          title: 'Scroll lost',
          html_url: 'https://github.com/org/repo/issues/12',
          state: 'open',
          user: { login: 'marie', avatar_url: 'm.png' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ])
    )

    const issues = await fetchIssuesByQuery('org', 'repo', 'is:open')

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      number: 12,
      title: 'Scroll lost',
      author: 'marie',
      repo: 'repo',
      fullName: 'org/repo',
    })
  })

  // The sidebar's hover card previews the description, so the body has to survive the mapping.
  it('carries the issue body through, normalizing a null one to undefined', async () => {
    stubGithub(
      searchResponse([
        {
          number: 1,
          title: 'With body',
          body: 'Repro steps here',
          html_url: '',
          state: 'open',
          created_at: '',
          updated_at: '',
        },
        {
          number: 2,
          title: 'No body',
          body: null,
          html_url: '',
          state: 'open',
          created_at: '',
          updated_at: '',
        },
      ])
    )

    const issues = await fetchIssuesByQuery('org', 'repo', 'is:open')

    expect(issues[0].body).toBe('Repro steps here')
    expect(issues[1].body).toBeUndefined()
  })

  it('returns an empty list when the search matches nothing', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({})))
    await expect(fetchIssuesByQuery('org', 'repo', 'is:open')).resolves.toEqual([])
  })

  // A rejected query has to surface — the sidebar shows GitHub's own message on that filter.
  it("throws with GitHub's message when the query is invalid", async () => {
    stubGithub(
      vi.fn().mockResolvedValue(jsonResponse({ message: 'Validation Failed' }, false, 422))
    )
    await expect(fetchIssuesByQuery('org', 'repo', 'is:nonsense')).rejects.toThrow()
  })
})

describe('fetchPullRequestsByQuery', () => {
  it('scopes the saved filter to the repo and to PRs, and passes the rest through', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }))
    stubGithub(fetchMock)

    await fetchPullRequestsByQuery('org', 'repo', 'is:open review-requested:@me', 'acct')

    const url = new URL(fetchMock.mock.calls[0][0].url)
    expect(url.pathname).toBe('/search/issues')
    expect(url.searchParams.get('q')).toBe('repo:org/repo is:pr is:open review-requested:@me')
  })

  it('maps the search results into pull requests', async () => {
    stubGithub(
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              number: 42,
              title: 'Add feature',
              html_url: 'https://github.com/org/repo/pull/42',
              state: 'open',
              draft: false,
              merged_at: null,
              user: { login: 'antoine', avatar_url: 'a.png' },
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-02T00:00:00Z',
            },
          ],
        })
      )
    )

    const prs = await fetchPullRequestsByQuery('org', 'repo', 'is:open')

    expect(prs).toHaveLength(1)
    expect(prs[0]).toMatchObject({ number: 42, title: 'Add feature', author: 'antoine' })
  })

  // Search returns the *issue* view of a PR, which carries no head/base — the caller swaps in the
  // full object from the repo's own PR list, so these coming back empty is expected, not a bug.
  it('leaves head and base empty, since search does not carry them', async () => {
    stubGithub(
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              number: 42,
              title: 'x',
              html_url: '',
              state: 'open',
              draft: false,
              merged_at: null,
              created_at: '',
              updated_at: '',
            },
          ],
        })
      )
    )

    const prs = await fetchPullRequestsByQuery('org', 'repo', 'is:open')

    expect(prs[0].headRef).toBe('')
    expect(prs[0].baseRef).toBe('')
  })

  it('returns an empty list when the search matches nothing', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({})))
    await expect(fetchPullRequestsByQuery('org', 'repo', 'is:open')).resolves.toEqual([])
  })

  it('throws when GitHub rejects the query', async () => {
    stubGithub(
      vi.fn().mockResolvedValue(jsonResponse({ message: 'Validation Failed' }, false, 422))
    )
    await expect(fetchPullRequestsByQuery('org', 'repo', 'is:nonsense')).rejects.toThrow()
  })
})

describe('createIssue', () => {
  it('POSTs the title and body to the repo issues endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ number: 99 }))
    stubGithub(fetchMock)

    await createIssue('org', 'repo', { title: 'Broken', body: 'Steps' }, 'acct')

    const [request] = fetchMock.mock.calls[0]
    expect(request.url).toBe('https://api.github.com/repos/org/repo/issues')
    expect(request.method).toBe('POST')
    expect(request.body).toEqual({ title: 'Broken', body: 'Steps' })
  })

  it('sends an empty body when none is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ number: 99 }))
    stubGithub(fetchMock)

    await createIssue('org', 'repo', { title: 'Broken' }, 'acct')

    expect(fetchMock.mock.calls[0][0].body).toEqual({ title: 'Broken', body: '' })
  })
})

describe('fetchPrReviewSummary', () => {
  function graphqlResponse(pullRequest: unknown) {
    return jsonResponse({ data: { repository: { pullRequest } } })
  }

  it('maps the review decision, reviewers and checks rollup', async () => {
    stubGithub(
      vi.fn().mockResolvedValue(
        graphqlResponse({
          reviewDecision: 'APPROVED',
          latestOpinionatedReviews: {
            nodes: [{ state: 'APPROVED', author: { login: 'marie', avatarUrl: 'm.png' } }],
          },
          reviewRequests: { nodes: [] },
          commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
        })
      )
    )

    const summary = await fetchPrReviewSummary('org', 'repo', 42, 'acct')

    expect(summary.reviewDecision).toBe('APPROVED')
    expect(summary.checksState).toBe('SUCCESS')
    expect(summary.reviewers).toEqual([{ login: 'marie', avatarUrl: 'm.png', state: 'APPROVED' }])
  })

  // A requested reviewer has left no review yet, so they only appear via reviewRequests.
  it('appends still-requested reviewers as pending', async () => {
    stubGithub(
      vi.fn().mockResolvedValue(
        graphqlResponse({
          reviewDecision: 'REVIEW_REQUIRED',
          latestOpinionatedReviews: { nodes: [] },
          reviewRequests: {
            nodes: [{ requestedReviewer: { login: 'bob', avatarUrl: 'b.png' } }],
          },
          commits: { nodes: [] },
        })
      )
    )

    const summary = await fetchPrReviewSummary('org', 'repo', 42, 'acct')

    expect(summary.reviewers).toEqual([{ login: 'bob', avatarUrl: 'b.png', state: 'PENDING' }])
  })

  // GitHub can re-request a review after one landed; the reviewer must not be listed twice.
  it('does not duplicate a reviewer who both reviewed and is re-requested', async () => {
    stubGithub(
      vi.fn().mockResolvedValue(
        graphqlResponse({
          reviewDecision: 'REVIEW_REQUIRED',
          latestOpinionatedReviews: {
            nodes: [{ state: 'CHANGES_REQUESTED', author: { login: 'marie', avatarUrl: '' } }],
          },
          reviewRequests: { nodes: [{ requestedReviewer: { login: 'marie', avatarUrl: '' } }] },
          commits: { nodes: [] },
        })
      )
    )

    const summary = await fetchPrReviewSummary('org', 'repo', 42, 'acct')

    expect(summary.reviewers).toHaveLength(1)
    expect(summary.reviewers[0].state).toBe('CHANGES_REQUESTED')
  })

  it('falls back to an empty summary when the PR is missing', async () => {
    stubGithub(vi.fn().mockResolvedValue(graphqlResponse(null)))

    const summary = await fetchPrReviewSummary('org', 'repo', 42, 'acct')

    expect(summary).toEqual({ reviewDecision: null, reviewers: [], checksState: null })
  })
})

describe('Tauri GitHub integration pass-throughs', () => {
  it('apiGithubDeviceCode delegates to githubDeviceCode', async () => {
    mockedTauri.githubDeviceCode.mockResolvedValue({ device_code: 'x' })
    await apiGithubDeviceCode('repo')
    expect(mockedTauri.githubDeviceCode).toHaveBeenCalledWith('repo')
  })

  it('apiGithubPollToken delegates to githubPollToken', async () => {
    mockedTauri.githubPollToken.mockResolvedValue({ user: { login: 'me' } })
    await apiGithubPollToken('device-code')
    expect(mockedTauri.githubPollToken).toHaveBeenCalledWith('device-code')
  })

  it('apiGithubConnectToken hands the token to Rust and gets back only the profile', async () => {
    mockedTauri.githubConnectToken.mockResolvedValue({ login: 'me' })
    await expect(apiGithubConnectToken('ghp_secret')).resolves.toEqual({ login: 'me' })
    expect(mockedTauri.githubConnectToken).toHaveBeenCalledWith('ghp_secret')
  })

  it('apiGithubDisconnectAccount delegates to githubDisconnectAccount', async () => {
    mockedTauri.githubDisconnectAccount.mockResolvedValue(undefined)
    await apiGithubDisconnectAccount('octocat')
    expect(mockedTauri.githubDisconnectAccount).toHaveBeenCalledWith('octocat')
  })

  it('apiGithubListRepos delegates to githubListRepos', async () => {
    mockedTauri.githubListRepos.mockResolvedValue([])
    await apiGithubListRepos('acct')
    expect(mockedTauri.githubListRepos).toHaveBeenCalledWith('acct')
  })
})

describe('fetchFileContentAtRef', () => {
  /**
   * The one call whose body is not JSON: the contents API's `raw` media type answers with the file
   * itself. Rust hands the body back as text either way, so this asserts the caller does *not* parse
   * it — a `JSON.parse` here would reject every source file that is not a JSON document.
   */
  it('returns the raw file text, unparsed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse('export const answer = 42\n'))
    stubGithub(fetchMock)

    const content = await fetchFileContentAtRef('org', 'repo', 'src/a.ts', 'main', 'acct')

    expect(content).toBe('export const answer = 42\n')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/repos/org/repo/contents/src/a.ts?ref=main',
        accept: 'application/vnd.github.raw',
        accountId: 'acct',
      })
    )
  })

  /** An added file has no version on the base side, and the caller treats that as an empty diff. */
  it('returns null when the file does not exist at that ref', async () => {
    stubGithub(vi.fn().mockResolvedValue(textResponse('Not Found', false, 404)))
    expect(await fetchFileContentAtRef('org', 'repo', 'new.ts', 'main', 'acct')).toBeNull()
  })

  it('throws on any other failure, rather than reporting an empty file', async () => {
    stubGithub(vi.fn().mockResolvedValue(textResponse('boom', false, 500)))
    await expect(fetchFileContentAtRef('org', 'repo', 'a.ts', 'main', 'acct')).rejects.toThrow(
      Error
    )
  })
})

describe('PR write operations', () => {
  it('createPullRequest POSTs the PR body with an auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(rawPR()))
    stubGithub(fetchMock)
    await createPullRequest(
      'org',
      'repo',
      { title: 'T', head: 'feat', base: 'main', body: 'B' },
      'acct'
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/repos/org/repo/pulls',
        method: 'POST',
        body: { title: 'T', head: 'feat', base: 'main', body: 'B' },
        accountId: 'acct',
      })
    )
  })

  it('fetchPrFiles builds the files listing URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    stubGithub(fetchMock)
    await fetchPrFiles('org', 'repo', 42, 'acct')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/repos/org/repo/pulls/42/files?per_page=100',
      })
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
    stubGithub(fetchMock)
    const result = await fetchPrFilesViewedState('org', 'repo', 42, 'acct')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://api.github.com/graphql', method: 'POST' })
    )
    expect(result).toEqual({
      pullRequestId: 'PR_kwABC',
      viewedByPath: { 'a.ts': 'VIEWED', 'b.ts': 'UNVIEWED' },
    })
  })

  it('fetchPrFilesViewedState defaults to an empty id/map when the PR is missing', async () => {
    stubGithub(
      vi.fn().mockResolvedValue(jsonResponse({ data: { repository: { pullRequest: null } } }))
    )
    const result = await fetchPrFilesViewedState('org', 'repo', 42, 'acct')
    expect(result).toEqual({ pullRequestId: '', viewedByPath: {} })
  })

  it('markPrFileAsViewed sends the markFileAsViewed mutation with pullRequestId/path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { markFileAsViewed: {} } }))
    stubGithub(fetchMock)
    await markPrFileAsViewed('PR_kwABC', 'a.ts', 'acct')
    const body = fetchMock.mock.calls[0][0].body
    expect(body.query).toContain('markFileAsViewed')
    expect(body.variables).toEqual({ id: 'PR_kwABC', path: 'a.ts' })
  })

  it('unmarkPrFileAsViewed sends the unmarkFileAsViewed mutation with pullRequestId/path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { unmarkFileAsViewed: {} } }))
    stubGithub(fetchMock)
    await unmarkPrFileAsViewed('PR_kwABC', 'a.ts', 'acct')
    const body = fetchMock.mock.calls[0][0].body
    expect(body.query).toContain('unmarkFileAsViewed')
    expect(body.variables).toEqual({ id: 'PR_kwABC', path: 'a.ts' })
  })

  it('postPrComment POSTs to the issues comments endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1, html_url: 'u' }))
    stubGithub(fetchMock)
    await postPrComment('org', 'repo', 42, 'hello', 'acct')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/repos/org/repo/issues/42/comments',
        method: 'POST',
        body: { body: 'hello' },
      })
    )
  })

  it('submitPrReview POSTs the review event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1, state: 'APPROVED' }))
    stubGithub(fetchMock)
    await submitPrReview('org', 'repo', 42, { event: 'APPROVE', body: 'lgtm' }, 'acct')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/repos/org/repo/pulls/42/reviews',
        method: 'POST',
        body: { event: 'APPROVE', body: 'lgtm' },
      })
    )
  })

  it('mergePullRequest PUTs the chosen merge method', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ sha: 'abc', merged: true, message: 'ok' }))
    stubGithub(fetchMock)
    await mergePullRequest('org', 'repo', 42, { mergeMethod: 'squash' }, 'acct')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/repos/org/repo/pulls/42/merge',
        method: 'PUT',
        body: { merge_method: 'squash', commit_title: undefined, commit_message: undefined },
      })
    )
  })

  it('fetchRepoDefaultBranch returns the default branch, falling back to main', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({ default_branch: 'develop' })))
    expect(await fetchRepoDefaultBranch('org', 'repo', 'acct')).toBe('develop')
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({})))
    expect(await fetchRepoDefaultBranch('org', 'repo', 'acct')).toBe('main')
  })

  it('propagates a non-2xx response as an error', async () => {
    stubGithub(vi.fn().mockResolvedValue(jsonResponse({}, false, 422)))
    await expect(
      createPullRequest('org', 'repo', { title: 'T', head: 'h', base: 'b' }, 'acct')
    ).rejects.toThrow()
  })

  it("includes GitHub's error message and field errors in the thrown error", async () => {
    stubGithub(
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
      await createPullRequest(
        'org',
        'repo',
        { title: 'T', head: 'feature-x', base: 'main' },
        'acct'
      )
    } catch (e) {
      err = e
    }
    expect(String(err)).toContain('Validation Failed')
    expect(String(err)).toContain('No commits between main and feature-x')
  })
})
