import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../api/github/github-issues.api', () => ({
  createIssue: vi.fn(),
  createIssueComment: vi.fn(),
  fetchIssuesByQuery: vi.fn(),
}))

import {
  createIssue,
  createIssueComment,
  fetchIssuesByQuery,
} from '../../../api/github/github-issues.api'
import type { MockIssue } from '../../../lib/github/types'
import { PROJECT_REPO } from '../../../lib/projectRepo'
import {
  apiCommentOnReportedIssue,
  apiCreateErrorIssue,
  apiFindReportedIssue,
} from './errorReport.api'
import type { ErrorReport } from '../lib/buildReport'

const REPORT: ErrorReport = {
  fingerprint: 'a1b2c3d4',
  title: 'UNKNOWN: boom',
  body: '<!-- gm-fp:a1b2c3d4 -->\nbody',
  verdict: 'bug',
  reasonKey: 'report.reason.unexpected',
}

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: 'gh-issue-7',
    number: 7,
    title: 'UNKNOWN: boom',
    body: '<!-- gm-fp:a1b2c3d4 -->',
    repo: 'git-manager',
    url: 'https://github.com/Tlahey/git-manager/issues/7',
    status: 'open',
    author: 'someone',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    comments: 0,
    thumbsUp: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('apiFindReportedIssue', () => {
  it('searches the app’s own tracker, never the repository the user has open', async () => {
    vi.mocked(fetchIssuesByQuery).mockResolvedValue([])
    await apiFindReportedIssue('a1b2c3d4', 'octocat')

    expect(fetchIssuesByQuery).toHaveBeenCalledWith(
      PROJECT_REPO.owner,
      PROJECT_REPO.repo,
      '"gm-fp:a1b2c3d4" in:body',
      'octocat'
    )
  })

  it('returns the issue whose body really carries the marker', async () => {
    vi.mocked(fetchIssuesByQuery).mockResolvedValue([issue()])
    await expect(apiFindReportedIssue('a1b2c3d4', 'octocat')).resolves.toMatchObject({ number: 7 })
  })

  it('rejects a search hit that does not actually contain the marker', async () => {
    // GitHub's search is not an exact phrase match inside an HTML comment, so a near-miss can come
    // back — telling a user their bug is already filed when it isn't is worse than a duplicate.
    vi.mocked(fetchIssuesByQuery).mockResolvedValue([issue({ body: 'unrelated issue' })])
    await expect(apiFindReportedIssue('a1b2c3d4', 'octocat')).resolves.toBeNull()
  })

  it('returns null when nothing matches', async () => {
    vi.mocked(fetchIssuesByQuery).mockResolvedValue([])
    await expect(apiFindReportedIssue('a1b2c3d4', 'octocat')).resolves.toBeNull()
  })
})

describe('apiCreateErrorIssue', () => {
  it('files the report on the project tracker and returns where it landed', async () => {
    vi.mocked(createIssue).mockResolvedValue({
      number: 42,
      title: REPORT.title,
      html_url: 'https://github.com/Tlahey/git-manager/issues/42',
      state: 'open',
      created_at: '',
      updated_at: '',
    })

    await expect(apiCreateErrorIssue(REPORT, 'octocat')).resolves.toEqual({
      number: 42,
      url: 'https://github.com/Tlahey/git-manager/issues/42',
    })
    expect(createIssue).toHaveBeenCalledWith(
      PROJECT_REPO.owner,
      PROJECT_REPO.repo,
      { title: REPORT.title, body: REPORT.body },
      'octocat'
    )
  })
})

describe('apiCommentOnReportedIssue', () => {
  it('adds the occurrence to the existing issue rather than opening a second one', async () => {
    vi.mocked(createIssueComment).mockResolvedValue({ id: 1, created_at: '' })
    await apiCommentOnReportedIssue(7, REPORT, 'octocat')

    const [, , number, body] = vi.mocked(createIssueComment).mock.calls[0]
    expect(number).toBe(7)
    expect(body).toContain('Also hit this.')
    expect(body).toContain(REPORT.body)
    expect(createIssue).not.toHaveBeenCalled()
  })
})
