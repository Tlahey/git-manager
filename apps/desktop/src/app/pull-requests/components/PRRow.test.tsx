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

describe('PRRow — row click', () => {
  it('opens the PR url on GitHub when no in-app view is available', async () => {
    render(
      <PRRow
        pr={pr({ url: 'https://github.com/owner/git-manager/pull/42' })}
        pinned={false}
        onTogglePin={vi.fn()}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByText('Add feature X'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(pluginOpen).toHaveBeenCalledWith('https://github.com/owner/git-manager/pull/42')
  })

  it('opens the in-app PR view instead of GitHub when a handler is provided', async () => {
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
    expect(onOpen).toHaveBeenCalledWith(thePr)
    expect(pluginOpen).not.toHaveBeenCalled()
  })
})

describe('PRRow — action menu', () => {
  it('is closed by default', () => {
    render(<PRRow pr={pr()} pinned={false} onTogglePin={vi.fn()} />)
    expect(screen.queryByText('Open on GitHub')).not.toBeInTheDocument()
  })

  it('opens on the more-actions button, without triggering the row click', async () => {
    const user = userEvent.setup()
    render(<PRRow pr={pr()} pinned={false} onTogglePin={vi.fn()} />)
    const [moreButton] = screen.getAllByRole('button').slice(-1)
    await user.click(moreButton)
    expect(screen.getByText('Open on GitHub')).toBeInTheDocument()
    expect(screen.getByText('Copy link')).toBeInTheDocument()
    expect(pluginOpen).not.toHaveBeenCalled()
  })

  it('opens the PR url via the "Open on GitHub" menu item and closes the menu', async () => {
    const user = userEvent.setup()
    render(
      <PRRow
        pr={pr({ url: 'https://github.com/owner/git-manager/pull/42' })}
        pinned={false}
        onTogglePin={vi.fn()}
      />
    )
    const [moreButton] = screen.getAllByRole('button').slice(-1)
    await user.click(moreButton)
    await act(async () => {
      fireEvent.click(screen.getByText('Open on GitHub'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(pluginOpen).toHaveBeenCalledWith('https://github.com/owner/git-manager/pull/42')
    expect(screen.queryByText('Open on GitHub')).not.toBeInTheDocument()
  })

  it('copies the PR url via the "Copy link" menu item', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    // userEvent.setup() installs its own navigator.clipboard stub, so ours must be defined after.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(
      <PRRow
        pr={pr({ url: 'https://github.com/owner/git-manager/pull/42' })}
        pinned={false}
        onTogglePin={vi.fn()}
      />
    )
    const [moreButton] = screen.getAllByRole('button').slice(-1)
    await user.click(moreButton)
    await user.click(screen.getByText('Copy link'))
    expect(writeText).toHaveBeenCalledWith('https://github.com/owner/git-manager/pull/42')
  })

  it('toggles pin via the menu item, reflecting the current pinned state in its label', async () => {
    const onTogglePin = vi.fn()
    const user = userEvent.setup()
    render(<PRRow pr={pr({ id: 'pr-2' })} pinned onTogglePin={onTogglePin} />)
    const [moreButton] = screen.getAllByRole('button').slice(-1)
    await user.click(moreButton)
    expect(screen.getByText('Unpin')).toBeInTheDocument()
    await user.click(screen.getByText('Unpin'))
    expect(onTogglePin).toHaveBeenCalledWith('pr-2')
  })

  it('closes the menu when clicking the backdrop', async () => {
    const user = userEvent.setup()
    const { container } = render(<PRRow pr={pr()} pinned={false} onTogglePin={vi.fn()} />)
    const [moreButton] = screen.getAllByRole('button').slice(-1)
    await user.click(moreButton)
    expect(screen.getByText('Open on GitHub')).toBeInTheDocument()
    const backdrop = container.querySelector('.fixed.inset-0.z-panel')!
    fireEvent.click(backdrop)
    expect(screen.queryByText('Open on GitHub')).not.toBeInTheDocument()
  })
})
