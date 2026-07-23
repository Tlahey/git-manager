import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GhRawIssue } from '../../../api/github.api'

vi.mock('../pr/PrComments', () => ({
  PrComments: () => <div data-testid="pr-comments-stub" />,
}))
vi.mock('../pr/PrCommentBox', () => ({
  PrCommentBox: () => <div data-testid="pr-comment-box-stub" />,
}))
vi.mock('../../../hooks/useIssueDetail', () => ({ useIssueDetail: vi.fn() }))
vi.mock('../../../hooks/useRepoGitHub', () => ({ useRepoGitHub: vi.fn() }))
vi.mock('../../../api/github.api', () => ({ setIssueState: vi.fn() }))

import { useIssueDetail } from '../../../hooks/useIssueDetail'
import { useRepoGitHub } from '../../../hooks/useRepoGitHub'
import { setIssueState } from '../../../api/github.api'
import { IssueDetailCenter } from './IssueDetailCenter'

const mocked = {
  useIssueDetail: useIssueDetail as unknown as ReturnType<typeof vi.fn>,
  useRepoGitHub: useRepoGitHub as unknown as ReturnType<typeof vi.fn>,
  setIssueState: setIssueState as unknown as ReturnType<typeof vi.fn>,
}

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

const refresh = vi.fn()

function mockDetail(issue: GhRawIssue | undefined, isLoading = false) {
  mocked.useIssueDetail.mockReturnValue({ issue, isLoading, error: null, refresh })
}

function mockGitHub(token: string | null) {
  mocked.useRepoGitHub.mockReturnValue({
    ownerRepo: token ? { owner: 'org', repo: 'repo' } : null,
    token,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGitHub('tok')
  mocked.setIssueState.mockResolvedValue({ number: 7, state: 'closed' })
})

describe('IssueDetailCenter', () => {
  it('shows a loading state', () => {
    mockDetail(undefined, true)
    render(<IssueDetailCenter repoPath="org/repo" issueNumber={7} onClose={vi.fn()} />)
    expect(screen.getByText('Loading issue…')).toBeInTheDocument()
  })

  it('renders the title, number, body, state and the comment thread', () => {
    mockDetail(raw())
    render(<IssueDetailCenter repoPath="org/repo" issueNumber={7} onClose={vi.fn()} />)
    expect(screen.getByText('A broken thing')).toBeInTheDocument()
    expect(screen.getByText('#7')).toBeInTheDocument()
    expect(screen.getByText('Plain body text')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByTestId('pr-comments-stub')).toBeInTheDocument()
    expect(screen.getByTestId('pr-comment-box-stub')).toBeInTheDocument()
  })

  it('closes an open issue and revalidates', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    mockDetail(raw({ state: 'open' }))
    render(
      <IssueDetailCenter repoPath="org/repo" issueNumber={7} onClose={vi.fn()} onChanged={onChanged} />
    )
    await act(async () => {
      await user.click(screen.getByTestId('issue-toggle-state'))
    })
    expect(mocked.setIssueState).toHaveBeenCalledWith('org', 'repo', 7, 'closed', 'tok')
    expect(refresh).toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalled()
  })

  it('hides the state action when signed out', () => {
    mockGitHub(null)
    mockDetail(raw())
    render(<IssueDetailCenter repoPath="org/repo" issueNumber={7} onClose={vi.fn()} />)
    expect(screen.queryByTestId('issue-toggle-state')).not.toBeInTheDocument()
  })

  it('calls onClose from the back button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mockDetail(raw())
    render(<IssueDetailCenter repoPath="org/repo" issueNumber={7} onClose={onClose} />)
    await user.click(screen.getByTestId('issue-detail-back'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
