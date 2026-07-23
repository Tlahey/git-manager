import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockIssue } from '../types'
import type { IssueActions } from '../../../hooks/useIssueActions'

const { pluginOpen } = vi.hoisted(() => ({ pluginOpen: vi.fn() }))
vi.mock('@tauri-apps/plugin-shell', () => ({ open: pluginOpen }))

const { useIssueActions } = vi.hoisted(() => ({ useIssueActions: vi.fn() }))
vi.mock('../../../hooks/useIssueActions', () => ({ useIssueActions }))

import { IssueRow } from './IssueRow'

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: '1',
    number: 42,
    title: 'Fix the thing',
    repo: 'git-manager',
    fullName: 'owner/git-manager',
    url: 'https://github.com/owner/repo/issues/42',
    status: 'open',
    author: 'octocat',
    authorAvatar: 'https://x/a.png',
    assignees: [],
    labels: ['bug'],
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 3,
    thumbsUp: 0,
    ...overrides,
  }
}

function mockActions(overrides: Partial<IssueActions> = {}) {
  useIssueActions.mockReturnValue({
    repoPath: null,
    branch: null,
    viewRepo: vi.fn(),
    createBranch: vi.fn(),
    creatingBranch: false,
    close: vi.fn(),
    closing: false,
    canClose: false,
    ...overrides,
  } satisfies IssueActions)
}

function renderRow(props: Partial<Parameters<typeof IssueRow>[0]> = {}) {
  return render(
    <IssueRow issue={issue()} pinned={false} onTogglePin={vi.fn()} {...props} />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  pluginOpen.mockResolvedValue(undefined)
  mockActions()
})

describe('IssueRow — content', () => {
  it('shows the title, number, label, comment count, author, repo, and status', () => {
    renderRow()
    expect(screen.getByText('Fix the thing')).toBeInTheDocument()
    expect(screen.getByText('#42')).toBeInTheDocument()
    expect(screen.getByText('bug')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('octocat')).toBeInTheDocument()
    expect(screen.getByText('git-manager')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it('shows the 👍 count only when there are reactions', () => {
    const { rerender } = renderRow({ issue: issue({ thumbsUp: 0 }) })
    expect(screen.queryByText('7')).not.toBeInTheDocument()
    rerender(<IssueRow issue={issue({ thumbsUp: 7 })} pinned={false} onTogglePin={vi.fn()} />)
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('collapses extra labels into a +N tag', () => {
    renderRow({ issue: issue({ labels: ['bug', 'ui', 'p1'] }) })
    expect(screen.getByText('bug')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.queryByText('ui')).not.toBeInTheDocument()
  })

  it('shows an em-dash when there are no assignees, an avatar stack otherwise', () => {
    const { rerender } = renderRow({ issue: issue({ assignees: [] }) })
    expect(screen.getByText('—')).toBeInTheDocument()
    rerender(
      <IssueRow
        issue={issue({ assignees: [{ login: 'bob', avatar: 'b.png' }] })}
        pinned={false}
        onTogglePin={vi.fn()}
      />
    )
    expect(screen.getByAltText('bob')).toBeInTheDocument()
  })
})

describe('IssueRow — repo / branch cell', () => {
  it('offers "Create a branch" when the repo is local and has no linked branch', () => {
    const createBranch = vi.fn()
    mockActions({ repoPath: '/local/git-manager', branch: null, createBranch })
    renderRow()
    const btn = screen.getByTestId('issue-create-branch-1')
    fireEvent.click(btn)
    expect(createBranch).toHaveBeenCalledOnce()
  })

  it('shows the linked branch instead of the create button when one exists', () => {
    mockActions({ repoPath: '/local/git-manager', branch: '42-fix-the-thing' })
    renderRow()
    expect(screen.getByTestId('issue-branch-1')).toHaveTextContent('42-fix-the-thing')
    expect(screen.queryByTestId('issue-create-branch-1')).not.toBeInTheDocument()
  })

  it('hides the create button entirely when the repo is not added locally', () => {
    mockActions({ repoPath: null, branch: null })
    renderRow()
    expect(screen.queryByTestId('issue-create-branch-1')).not.toBeInTheDocument()
  })
})

describe('IssueRow — actions', () => {
  it('toggles the pin', () => {
    const onTogglePin = vi.fn()
    renderRow({ onTogglePin })
    fireEvent.click(screen.getByTitle('Pin'))
    expect(onTogglePin).toHaveBeenCalledWith('1')
  })

  it('calls viewRepo from the actions dropdown', async () => {
    const user = userEvent.setup()
    const viewRepo = vi.fn()
    mockActions({ viewRepo })
    renderRow()
    await user.click(screen.getByRole('button', { name: 'More options' }))
    await user.click(screen.getByRole('menuitem', { name: 'View repo' }))
    expect(viewRepo).toHaveBeenCalledOnce()
  })

  it('confirms before closing, then calls close', async () => {
    const user = userEvent.setup()
    const close = vi.fn().mockResolvedValue(undefined)
    mockActions({ canClose: true, close })
    renderRow()
    await user.click(screen.getByRole('button', { name: 'More options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Mark as closed' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Close this issue?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Mark as closed' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('omits the close action from the menu when closing is not possible', async () => {
    const user = userEvent.setup()
    mockActions({ canClose: false })
    renderRow()
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.queryByRole('menuitem', { name: 'Mark as closed' })).not.toBeInTheDocument()
  })

  it('opens the issue URL when the row is clicked and no panel is available', async () => {
    renderRow()
    await act(async () => {
      fireEvent.click(screen.getByText('Fix the thing'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(pluginOpen).toHaveBeenCalledWith('https://github.com/owner/repo/issues/42')
  })
})
