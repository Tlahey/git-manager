import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GhRawIssue } from '../../../api/github.api'
import type { MockIssue } from '../../../app/pull-requests/types'

vi.mock('../pr/PrComments', () => ({ PrComments: () => <div data-testid="pr-comments-stub" /> }))
vi.mock('../pr/PrCommentBox', () => ({
  PrCommentBox: () => <div data-testid="pr-comment-box-stub" />,
}))
vi.mock('./IssueMetaSidebar', () => ({
  IssueMetaSidebar: () => <div data-testid="issue-meta-sidebar-stub" />,
}))
vi.mock('../../../hooks/useIssueDetail', () => ({ useIssueDetail: vi.fn() }))

import { useIssueDetail } from '../../../hooks/useIssueDetail'
import { IssueDetailCenter } from './IssueDetailCenter'

const mockedDetail = useIssueDetail as unknown as ReturnType<typeof vi.fn>

function raw(overrides: Partial<GhRawIssue> = {}): GhRawIssue {
  return {
    number: 7,
    title: 'A broken thing',
    body: 'Plain body text',
    html_url: '',
    state: 'open',
    user: { login: 'octocat', avatar_url: '' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function issue(): MockIssue {
  return {
    id: '1',
    number: 7,
    title: 'A broken thing',
    repo: 'repo',
    fullName: 'org/repo',
    url: '',
    status: 'open',
    author: 'octocat',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 0,
    thumbsUp: 0,
  }
}

function mockDetail(issueRaw: GhRawIssue | undefined, isLoading = false) {
  mockedDetail.mockReturnValue({ issue: issueRaw, isLoading, error: null, refresh: vi.fn() })
}

function renderCenter(onClose = vi.fn()) {
  return render(
    <IssueDetailCenter repoPath="org/repo" issueNumber={7} issue={issue()} onClose={onClose} />
  )
}

beforeEach(() => vi.clearAllMocks())

describe('IssueDetailCenter', () => {
  it('shows a loading state', () => {
    mockDetail(undefined, true)
    renderCenter()
    expect(screen.getByText('Loading issue…')).toBeInTheDocument()
  })

  it('renders the title, number, body, state, the comment thread and the metadata sidebar', () => {
    mockDetail(raw())
    renderCenter()
    expect(screen.getByText('A broken thing')).toBeInTheDocument()
    expect(screen.getByText('#7')).toBeInTheDocument()
    expect(screen.getByText('Plain body text')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByTestId('pr-comments-stub')).toBeInTheDocument()
    expect(screen.getByTestId('pr-comment-box-stub')).toBeInTheDocument()
    expect(screen.getByTestId('issue-meta-sidebar-stub')).toBeInTheDocument()
  })

  it('calls onClose from the back button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mockDetail(raw())
    renderCenter(onClose)
    await user.click(screen.getByTestId('issue-detail-back'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
