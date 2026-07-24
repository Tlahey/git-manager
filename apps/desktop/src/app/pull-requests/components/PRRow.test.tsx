import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockPR } from '../types'

const { pluginOpen } = vi.hoisted(() => ({ pluginOpen: vi.fn() }))
vi.mock('@tauri-apps/plugin-shell', () => ({ open: pluginOpen }))

import { PRRow } from './PRRow'
import { OpenPrContext } from '../OpenPrContext'

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: '1',
    number: 42,
    title: 'Add feature X',
    repo: 'git-manager',
    repoUrl: 'https://github.com/owner/git-manager',
    url: 'https://github.com/owner/git-manager/pull/42',
    status: 'open',
    ciStatus: null,
    author: 'octocat',
    authorAvatar: 'https://x/a.png',
    collaborators: [],
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewStatus: 'pending',
    isDraft: false,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  pluginOpen.mockResolvedValue(undefined)
})

describe('PRRow — content', () => {
  it('shows the title, PR number, author and repo', () => {
    render(<PRRow pr={pr()} pinned={false} onTogglePin={vi.fn()} />)
    expect(screen.getByText('Add feature X')).toBeInTheDocument()
    expect(screen.getByText('#42')).toBeInTheDocument()
    expect(screen.getByText('octocat')).toBeInTheDocument()
    expect(screen.getByText('git-manager')).toBeInTheDocument()
  })

  it('shows additions/deletions and file count when present', () => {
    render(
      <PRRow
        pr={pr({ additions: 12, deletions: 4, filesChanged: 3 })}
        pinned={false}
        onTogglePin={vi.fn()}
      />
    )
    expect(screen.getByText('+12')).toBeInTheDocument()
    expect(screen.getByText('−4')).toBeInTheDocument()
    expect(screen.getByText('· 3 files')).toBeInTheDocument()
  })

  it('shows just the file count when there are no line changes', () => {
    render(
      <PRRow
        pr={pr({ additions: 0, deletions: 0, filesChanged: 5 })}
        pinned={false}
        onTogglePin={vi.fn()}
      />
    )
    expect(screen.getByText('5 files')).toBeInTheDocument()
  })

  it('shows up to 2 labels', () => {
    render(
      <PRRow
        pr={pr({ labels: ['bug', 'urgent', 'wontfix'] })}
        pinned={false}
        onTogglePin={vi.fn()}
      />
    )
    expect(screen.getByText('bug')).toBeInTheDocument()
    expect(screen.getByText('urgent')).toBeInTheDocument()
    expect(screen.queryByText('wontfix')).not.toBeInTheDocument()
  })

  it('shows the source branch in a tag under the repo when present', () => {
    render(
      <PRRow pr={pr({ id: 'pr-b', headRef: 'feat/thing' })} pinned={false} onTogglePin={vi.fn()} />
    )
    expect(screen.getByTestId('pr-branch-pr-b')).toHaveTextContent('feat/thing')
  })

  it('omits the branch tag when there is no head ref', () => {
    render(<PRRow pr={pr({ id: 'pr-c' })} pinned={false} onTogglePin={vi.fn()} />)
    expect(screen.queryByTestId('pr-branch-pr-c')).not.toBeInTheDocument()
  })

  it('shows a rebase-required badge when needsRebase is true', () => {
    render(<PRRow pr={pr({ needsRebase: true })} pinned={false} onTogglePin={vi.fn()} />)
    expect(screen.getByText('Rebase required')).toBeInTheDocument()
  })

  it('hides the rebase-required badge otherwise', () => {
    render(<PRRow pr={pr({ needsRebase: false })} pinned={false} onTogglePin={vi.fn()} />)
    expect(screen.queryByText('Rebase required')).not.toBeInTheDocument()
  })

  it('shows an em-dash when there are no collaborators, an avatar stack otherwise', () => {
    // With ciStatus: null, CiBadge also renders its own "—", so there are 2 by default.
    const { rerender } = render(
      <PRRow pr={pr({ collaborators: [] })} pinned={false} onTogglePin={vi.fn()} />
    )
    expect(screen.getAllByText('—')).toHaveLength(2)

    rerender(
      <PRRow
        pr={pr({ collaborators: [{ login: 'bob', avatar: 'b.png' }] })}
        pinned={false}
        onTogglePin={vi.fn()}
      />
    )
    expect(screen.getAllByText('—')).toHaveLength(1)
  })
})

describe('PRRow — status icon', () => {
  it('shows a purple merge icon for merged PRs', () => {
    const { container } = render(
      <PRRow pr={pr({ status: 'merged' })} pinned={false} onTogglePin={vi.fn()} />
    )
    expect(container.querySelector('.text-purple-400')).toBeTruthy()
  })

  it('shows a destructive X icon for closed PRs', () => {
    const { container } = render(
      <PRRow pr={pr({ status: 'closed' })} pinned={false} onTogglePin={vi.fn()} />
    )
    expect(container.querySelector('.text-destructive')).toBeTruthy()
  })

  it('shows a muted circle icon for draft PRs', () => {
    const { container } = render(
      <PRRow pr={pr({ status: 'open', isDraft: true })} pinned={false} onTogglePin={vi.fn()} />
    )
    expect(container.querySelector('.lucide-circle')).toBeTruthy()
  })

  it('shows a green PR icon for open, non-draft PRs', () => {
    const { container } = render(
      <PRRow pr={pr({ status: 'open', isDraft: false })} pinned={false} onTogglePin={vi.fn()} />
    )
    expect(container.querySelector('.text-green-400')).toBeTruthy()
  })
})

describe('PRRow — pin button', () => {
  it('shows an amber, filled pin icon when pinned', () => {
    const { container } = render(<PRRow pr={pr()} pinned onTogglePin={vi.fn()} />)
    expect(screen.getByTitle('Unpin')).toBeInTheDocument()
    expect(container.querySelector('.text-amber-400')).toBeTruthy()
  })

  it('shows a muted, unfilled pin icon when unpinned', () => {
    render(<PRRow pr={pr()} pinned={false} onTogglePin={vi.fn()} />)
    expect(screen.getByTitle('Pin')).toBeInTheDocument()
  })

  it('toggles pin without opening the PR', async () => {
    const onTogglePin = vi.fn()
    const user = userEvent.setup()
    render(<PRRow pr={pr({ id: 'pr-1' })} pinned={false} onTogglePin={onTogglePin} />)
    await user.click(screen.getByTitle('Pin'))
    expect(onTogglePin).toHaveBeenCalledWith('pr-1')
    expect(pluginOpen).not.toHaveBeenCalled()
  })
})

describe('PRRow — PR number link and row click', () => {
  it('opens the PR url on GitHub when clicking the #number link', async () => {
    render(
      <PRRow
        pr={pr({ url: 'https://github.com/owner/git-manager/pull/42' })}
        pinned={false}
        onTogglePin={vi.fn()}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByText('#42'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(pluginOpen).toHaveBeenCalledWith('https://github.com/owner/git-manager/pull/42')
  })

  it('does not open GitHub or panel when clicking on the row title', async () => {
    const onOpen = vi.fn()
    const thePr = pr({ id: 'pr-9', url: 'https://github.com/owner/git-manager/pull/42' })
    render(
      <OpenPrContext.Provider value={onOpen}>
        <PRRow pr={thePr} pinned={false} onTogglePin={vi.fn()} />
      </OpenPrContext.Provider>
    )
    await act(async () => {
      fireEvent.click(screen.getByText('Add feature X'))
      await Promise.resolve()
    })
    expect(onOpen).not.toHaveBeenCalled()
    expect(pluginOpen).not.toHaveBeenCalled()
  })
})

describe('PRRow — quick actions', () => {
  it('renders a state-dependent primary split button (View for a plain open PR)', () => {
    render(<PRRow pr={pr()} pinned={false} onTogglePin={vi.fn()} />)
    expect(screen.getByTestId('pr-actions-1-btn')).toHaveTextContent('View')
  })

  it('exposes the secondary actions in the caret dropdown', async () => {
    const user = userEvent.setup()
    render(<PRRow pr={pr()} pinned={false} onTogglePin={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.getByRole('menuitem', { name: 'Open on GitHub' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy link' })).toBeInTheDocument()
  })

  it('renders a snooze control on the row edge, not in the dropdown', async () => {
    const user = userEvent.setup()
    render(<PRRow pr={pr({ id: 'pr-2' })} pinned={false} onTogglePin={vi.fn()} />)
    expect(screen.getByTestId('snooze-trigger-pr-2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.queryByRole('menuitem', { name: /Snooze/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Pin/ })).not.toBeInTheDocument()
  })

  it('renders an open-in-app icon that opens the in-app view when available', async () => {
    const onOpen = vi.fn()
    const thePr = pr({ id: 'pr-3' })
    const user = userEvent.setup()
    render(
      <OpenPrContext.Provider value={onOpen}>
        <PRRow pr={thePr} pinned={false} onTogglePin={vi.fn()} />
      </OpenPrContext.Provider>
    )
    await user.click(screen.getByTestId('pr-open-in-app-pr-3'))
    expect(onOpen).toHaveBeenCalledWith(thePr)
  })

  it('hides the open-in-app icon when no in-app view is available', () => {
    render(<PRRow pr={pr({ id: 'pr-4' })} pinned={false} onTogglePin={vi.fn()} />)
    expect(screen.queryByTestId('pr-open-in-app-pr-4')).not.toBeInTheDocument()
  })
})
