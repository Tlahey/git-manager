import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GhRawIssue } from '../../../api/github.api'
import type { MockIssue } from '../../../app/pull-requests/types'
import type { IssueActions } from '../../../hooks/useIssueActions'

vi.mock('../../../hooks/useIssueDetail', () => ({ useIssueDetail: vi.fn() }))
vi.mock('../../../hooks/useRepoGitHub', () => ({ useRepoGitHub: vi.fn() }))
vi.mock('../../../hooks/useIssueActions', () => ({ useIssueActions: vi.fn() }))
vi.mock('../../../hooks/usePrEditCandidates', () => ({
  useAssignableUsers: vi.fn(),
  useRepoLabels: vi.fn(),
}))
vi.mock('../../../api/github.api', () => ({
  addAssignees: vi.fn().mockResolvedValue({}),
  removeAssignees: vi.fn().mockResolvedValue({}),
  addLabels: vi.fn().mockResolvedValue({}),
  removeLabel: vi.fn().mockResolvedValue({}),
  setIssueState: vi.fn().mockResolvedValue({}),
}))

import { useIssueDetail } from '../../../hooks/useIssueDetail'
import { useRepoGitHub } from '../../../hooks/useRepoGitHub'
import { useIssueActions } from '../../../hooks/useIssueActions'
import { useAssignableUsers, useRepoLabels } from '../../../hooks/usePrEditCandidates'
import { addAssignees, addLabels, setIssueState } from '../../../api/github.api'
import { IssueMetaSidebar } from './IssueMetaSidebar'

const m = {
  useIssueDetail: useIssueDetail as unknown as ReturnType<typeof vi.fn>,
  useRepoGitHub: useRepoGitHub as unknown as ReturnType<typeof vi.fn>,
  useIssueActions: useIssueActions as unknown as ReturnType<typeof vi.fn>,
  useAssignableUsers: useAssignableUsers as unknown as ReturnType<typeof vi.fn>,
  useRepoLabels: useRepoLabels as unknown as ReturnType<typeof vi.fn>,
  addAssignees: addAssignees as unknown as ReturnType<typeof vi.fn>,
  addLabels: addLabels as unknown as ReturnType<typeof vi.fn>,
  setIssueState: setIssueState as unknown as ReturnType<typeof vi.fn>,
}

const refresh = vi.fn()

function raw(overrides: Partial<GhRawIssue> = {}): GhRawIssue {
  return {
    number: 7,
    title: 'Bug',
    html_url: '',
    state: 'open',
    assignees: [{ login: 'alice', avatar_url: '' }],
    labels: [{ name: 'bug', color: 'ff0000' }],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function issue(): MockIssue {
  return {
    id: '1',
    number: 7,
    title: 'Bug',
    repo: 'repo',
    fullName: 'org/repo',
    url: '',
    status: 'open',
    author: 'alice',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 0,
    thumbsUp: 0,
  }
}

function mockActions(overrides: Partial<IssueActions> = {}) {
  m.useIssueActions.mockReturnValue({
    repoPath: '/local/repo',
    branch: null,
    viewRepo: vi.fn(),
    createBranch: vi.fn(),
    creatingBranch: false,
    close: vi.fn(),
    closing: false,
    canClose: true,
    ...overrides,
  } satisfies IssueActions)
}

function renderSidebar(onChanged = vi.fn()) {
  return render(
    <IssueMetaSidebar repoPath="org/repo" issueNumber={7} issue={issue()} onChanged={onChanged} />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  m.useIssueDetail.mockReturnValue({ issue: raw(), isLoading: false, error: null, refresh })
  m.useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: 'tok' })
  m.useAssignableUsers.mockReturnValue({ users: [{ login: 'bob', avatar_url: '' }], isLoading: false })
  m.useRepoLabels.mockReturnValue({ labels: [{ name: 'ui', color: '00ff00' }], isLoading: false })
  mockActions()
})

describe('IssueMetaSidebar — status', () => {
  it('shows the state and sets it closed from the edit dropdown', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    renderSidebar(onChanged)
    expect(screen.getByTestId('issue-status')).toHaveTextContent('Open')
    await user.click(screen.getByTestId('issue-status-edit'))
    await act(async () => {
      await user.click(screen.getByTestId('issue-status-closed'))
    })
    expect(m.setIssueState).toHaveBeenCalledWith('org', 'repo', 7, 'closed', 'tok')
    expect(refresh).toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalled()
  })
})

describe('IssueMetaSidebar — assignees', () => {
  it('lists assignees and adds one through the edit popover', async () => {
    const user = userEvent.setup()
    renderSidebar()
    expect(screen.getByTestId('issue-assignees')).toHaveTextContent('alice')
    await user.click(screen.getByTestId('issue-assignees-edit'))
    await act(async () => {
      await user.click(screen.getByTestId('pr-edit-add-bob'))
    })
    expect(m.addAssignees).toHaveBeenCalledWith('org', 'repo', 7, ['bob'], 'tok')
  })
})

describe('IssueMetaSidebar — labels', () => {
  it('lists labels and adds one through the edit popover', async () => {
    const user = userEvent.setup()
    renderSidebar()
    expect(screen.getByTestId('issue-label-bug')).toBeInTheDocument()
    await user.click(screen.getByTestId('issue-labels-edit'))
    await act(async () => {
      await user.click(screen.getByTestId('pr-edit-add-ui'))
    })
    expect(m.addLabels).toHaveBeenCalledWith('org', 'repo', 7, ['ui'], 'tok')
  })
})

describe('IssueMetaSidebar — branch', () => {
  it('offers to create a branch when the local repo has none, and creates it', async () => {
    const user = userEvent.setup()
    const createBranch = vi.fn()
    mockActions({ repoPath: '/local/repo', branch: null, createBranch })
    renderSidebar()
    await user.click(screen.getByTestId('issue-create-branch'))
    expect(createBranch).toHaveBeenCalledOnce()
  })

  it('shows the linked branch instead of the create button when present', () => {
    mockActions({ repoPath: '/local/repo', branch: '7-bug' })
    renderSidebar()
    expect(screen.getByTestId('issue-branch')).toHaveTextContent('7-bug')
    expect(screen.queryByTestId('issue-create-branch')).not.toBeInTheDocument()
  })
})
