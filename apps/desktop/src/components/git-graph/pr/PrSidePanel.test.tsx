import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GhRawPR } from '../../../api/github.api'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { usePrDetailMock, usePrCommentsMock, actions, useAssignableUsersMock, useRepoLabelsMock } =
  vi.hoisted(() => ({
    usePrDetailMock: vi.fn(),
    usePrCommentsMock: vi.fn(),
    actions: {
      requestReviewer: vi.fn(),
      unrequestReviewer: vi.fn(),
      assign: vi.fn(),
      unassign: vi.fn(),
      addLabel: vi.fn(),
      deleteLabel: vi.fn(),
      pending: false,
    },
    useAssignableUsersMock: vi.fn(),
    useRepoLabelsMock: vi.fn(),
  }))
vi.mock('../../../hooks/usePrDetail', () => ({ usePrDetail: usePrDetailMock }))
vi.mock('../../../hooks/usePrComments', () => ({ usePrComments: usePrCommentsMock }))
vi.mock('../../../hooks/usePrActions', () => ({ usePrActions: () => actions }))
vi.mock('../../../hooks/usePrEditCandidates', () => ({
  useAssignableUsers: (...a: unknown[]) => useAssignableUsersMock(...a),
  useRepoLabels: (...a: unknown[]) => useRepoLabelsMock(...a),
}))

// Stub the data/action-heavy leaves so this test stays on the panel's composition.
vi.mock('./PrFilesList', () => ({
  PrFilesList: (p: { headerAction?: React.ReactNode }) => <div data-testid="stub-files">{p.headerAction}</div>,
}))
vi.mock('./PrReviewComposer', () => ({ PrReviewComposer: () => <div data-testid="stub-review" /> }))
vi.mock('./PrStateActions', () => ({ PrStateActions: () => <div data-testid="stub-state-actions" /> }))
vi.mock('./PrCodeSuggestions', () => ({ PrCodeSuggestions: () => <div data-testid="stub-suggestions" /> }))

import { PrSidePanel } from './PrSidePanel'

function pr(overrides: Partial<GhRawPR> = {}): GhRawPR {
  return {
    number: 7,
    title: 'T',
    html_url: '',
    state: 'open',
    draft: false,
    merged_at: null,
    created_at: '',
    updated_at: '',
    user: { login: 'author', avatar_url: '' },
    requested_reviewers: [{ login: 'rev1', avatar_url: '' }],
    assignees: [{ login: 'assignee1', avatar_url: '' }],
    labels: [{ name: 'bug' }],
    head: { ref: 'feat/x' },
    base: { ref: 'main' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  actions.pending = false
  usePrCommentsMock.mockReturnValue({ comments: [], isLoading: false, refresh: vi.fn() })
  useAssignableUsersMock.mockReturnValue({
    users: [
      { login: 'rev1', avatar_url: '' },
      { login: 'carol', avatar_url: '' },
    ],
    isLoading: false,
  })
  useRepoLabelsMock.mockReturnValue({ labels: [{ name: 'bug' }, { name: 'chore' }], isLoading: false })
})

describe('PrSidePanel', () => {
  it('shows a spinner while the PR is loading', () => {
    usePrDetailMock.mockReturnValue({ pr: undefined, isLoading: true })
    render(<PrSidePanel repoPath="/repo" prNumber={7} />)
    expect(screen.getByTestId('pr-side-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('pr-reviewers')).not.toBeInTheDocument()
  })

  it('renders all sections with reviewers, assignees, labels and branch', () => {
    usePrDetailMock.mockReturnValue({ pr: pr(), isLoading: false })
    render(<PrSidePanel repoPath="/repo" prNumber={7} />)
    // Scope by section — a login can appear both in its section and under Participants.
    expect(within(screen.getByTestId('pr-reviewers')).getByTestId('pr-user-rev1')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('pr-assignees')).getByTestId('pr-user-assignee1')
    ).toBeInTheDocument()
    expect(screen.getByTestId('pr-label-bug')).toBeInTheDocument()
    expect(screen.getByTestId('pr-branch')).toHaveTextContent('feat/x')
    expect(screen.getByTestId('pr-branch')).toHaveTextContent('main')
    expect(screen.getByTestId('stub-state-actions')).toBeInTheDocument()
  })

  it('derives participants from the author, reviewers, assignees and commenters (de-duplicated)', () => {
    usePrCommentsMock.mockReturnValue({
      comments: [{ id: 1, user: { login: 'commenter', avatar_url: '' } }],
      isLoading: false,
      refresh: vi.fn(),
    })
    usePrDetailMock.mockReturnValue({ pr: pr(), isLoading: false })
    render(<PrSidePanel repoPath="/repo" prNumber={7} />)
    const participants = screen.getByTestId('pr-participants')
    expect(participants).toHaveTextContent('author')
    expect(participants).toHaveTextContent('rev1')
    expect(participants).toHaveTextContent('commenter')
  })

  it('toggles the review composer from the files header action', async () => {
    usePrDetailMock.mockReturnValue({ pr: pr(), isLoading: false })
    const user = userEvent.setup()
    render(<PrSidePanel repoPath="/repo" prNumber={7} />)
    expect(screen.queryByTestId('stub-review')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('pr-review-toggle'))
    expect(screen.getByTestId('stub-review')).toBeInTheDocument()
  })

  it('opens the reviewers editor and requests a new reviewer', async () => {
    usePrDetailMock.mockReturnValue({ pr: pr(), isLoading: false })
    const user = userEvent.setup()
    render(<PrSidePanel repoPath="/repo" prNumber={7} />)
    await user.click(screen.getByTestId('pr-reviewers-edit'))
    // The popover shows candidates excluding the already-requested rev1.
    expect(screen.getByTestId('pr-edit-popover')).toBeInTheDocument()
    expect(screen.queryByTestId('pr-edit-add-rev1')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('pr-edit-add-carol'))
    expect(actions.requestReviewer).toHaveBeenCalledWith('carol')
  })

  it('removes an existing reviewer from the editor', async () => {
    usePrDetailMock.mockReturnValue({ pr: pr(), isLoading: false })
    const user = userEvent.setup()
    render(<PrSidePanel repoPath="/repo" prNumber={7} />)
    await user.click(screen.getByTestId('pr-reviewers-edit'))
    await user.click(screen.getByTestId('pr-edit-remove-rev1'))
    expect(actions.unrequestReviewer).toHaveBeenCalledWith('rev1')
  })

  it('edits labels via the shared popover', async () => {
    usePrDetailMock.mockReturnValue({ pr: pr(), isLoading: false })
    const user = userEvent.setup()
    render(<PrSidePanel repoPath="/repo" prNumber={7} />)
    await user.click(screen.getByTestId('pr-labels-edit'))
    await user.click(screen.getByTestId('pr-edit-add-chore'))
    expect(actions.addLabel).toHaveBeenCalledWith('chore')
  })
})
