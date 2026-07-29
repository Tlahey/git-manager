import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitWorktree, PullRequest } from '@git-manager/git-types'
import { WorktreeItem } from './WorktreeItem'

const { openRepoTab } = vi.hoisted(() => ({ openRepoTab: vi.fn() }))
vi.mock('../../hooks/useOpenRepoTab', () => ({ useOpenRepoTab: () => openRepoTab }))

vi.mock('./HoverExpandLabel', () => ({
  HoverExpandLabel: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}))

const PATH = '/tmp/repo-linked'

function worktree(overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: PATH,
    branch: 'feature/login',
    commitOid: 'abcdef1234567890',
    isMain: false,
    isLocked: false,
    isDirty: false,
    isPrunable: false,
    ...overrides,
  }
}

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 42,
    title: 'Add login',
    body: '',
    state: 'open',
    author: 'antoine',
    authorAvatar: '',
    headRef: 'feature/login',
    baseRef: 'main',
    url: '',
    ciStatus: null,
    createdAt: '',
    updatedAt: '',
    isDraft: false,
    assignees: [],
    requestedReviewers: [],
    labels: [],
    ...overrides,
  }
}

const WIP = { path: PATH, branch: 'feature/login', totalChanges: 10, added: 3, modified: 5, deleted: 2 }

beforeEach(() => openRepoTab.mockClear())

describe('WorktreeItem — pull request tag', () => {
  // Worktree rows never advertise their branch's pull request, whatever state it is in — the PR
  // lives in the Pull Requests section, and repeating it here only crowded a narrow row.
  it.each(['open', 'merged', 'closed', 'draft'] as const)(
    'shows no tag for a %s pull request',
    (state) => {
      render(<WorktreeItem wt={worktree({ branch: pr({ state }).headRef })} />)
      expect(screen.queryByTestId('pr-status-tag-42')).not.toBeInTheDocument()
    }
  )
})

describe('WorktreeItem — pending-changes indicator', () => {
  // The row itself stays a bare dot: it has to survive in a narrow column, and the counts are one
  // hover away. Only the tooltip's contents are built from the shared Tag primitive.
  it('marks a dirty worktree with a round amber dot carrying no text', () => {
    render(<WorktreeItem wt={worktree()} wipStatus={WIP} />)
    const dot = screen.getByTestId(`worktree-changes-bubble-${PATH}`)
    expect(dot.className).toContain('rounded-full')
    expect(dot.className).toContain('bg-amber-400')
    expect(dot).toHaveTextContent('')
  })

  // The dot has no text, so its label is the only thing announcing it.
  it('labels the dot for assistive tech', () => {
    render(<WorktreeItem wt={worktree()} wipStatus={WIP} />)
    expect(screen.getByLabelText('10 pending changes')).toBeInTheDocument()
  })

  it('shows nothing when the worktree is clean', () => {
    render(<WorktreeItem wt={worktree()} />)
    expect(screen.queryByTestId(`worktree-changes-bubble-${PATH}`)).not.toBeInTheDocument()
  })

  it('breaks the counts down into one toned Tag each on hover', () => {
    vi.useFakeTimers()
    try {
      render(<WorktreeItem wt={worktree()} wipStatus={WIP} />)
      fireEvent.mouseEnter(screen.getByTestId(`worktree-changes-bubble-${PATH}`))
      act(() => vi.advanceTimersByTime(1))

      const tip = screen.getByRole('tooltip')
      const tags = tip.querySelectorAll('span.inline-flex')
      expect(tags).toHaveLength(3)
      // Added / modified / deleted, each on the shared Tag's own accessible tone token.
      expect(tags[0].className).toContain('text-tone-success')
      expect(tags[0]).toHaveTextContent('3')
      expect(tags[1].className).toContain('text-tone-warning')
      expect(tags[1]).toHaveTextContent('5')
      expect(tags[2].className).toContain('text-tone-danger')
      expect(tags[2]).toHaveTextContent('2')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('WorktreeItem — working directory on hover', () => {
  it('keeps the path off the row itself', () => {
    render(<WorktreeItem wt={worktree()} />)
    expect(screen.getByText('feature/login')).toBeInTheDocument()
    expect(screen.queryByText(PATH)).not.toBeInTheDocument()
  })

  it('reveals the working directory once the pointer rests on the row', () => {
    vi.useFakeTimers()
    try {
      render(<WorktreeItem wt={worktree()} />)
      fireEvent.mouseEnter(screen.getByTestId(`worktree-item-${PATH}`))
      act(() => vi.advanceTimersByTime(500))

      expect(screen.getByTestId(`worktree-hover-card-${PATH}`)).toBeInTheDocument()
      expect(screen.getByText('Working directory')).toBeInTheDocument()
      expect(screen.getByText(PATH)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  // Below the row, not beside it. The primitive flips it above on its own when there is no room.
  it('opens below the row', () => {
    vi.useFakeTimers()
    try {
      render(<WorktreeItem wt={worktree()} />)
      const row = screen.getByTestId(`worktree-item-${PATH}`)
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 120,
        left: 0,
        right: 200,
        width: 200,
        height: 20,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect)

      fireEvent.mouseEnter(row)
      act(() => vi.advanceTimersByTime(500))

      // jsdom reports every element as 0×0, so the bubble lands at the row's bottom edge + the
      // component's 6px gap. Above would have put it at or below the row's top (100).
      expect(screen.getByRole('tooltip')).toHaveStyle({ top: '126px' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('stays shut while the pointer is on the pending-changes dot', () => {
    vi.useFakeTimers()
    try {
      render(<WorktreeItem wt={worktree()} wipStatus={WIP} />)
      fireEvent.mouseEnter(screen.getByTestId(`worktree-changes-bubble-${PATH}`))
      act(() => vi.advanceTimersByTime(1000))

      expect(screen.queryByTestId(`worktree-hover-card-${PATH}`)).not.toBeInTheDocument()
      // The dot's own breakdown is the relevant one there, and it still shows.
      expect(screen.getByRole('tooltip')).toHaveTextContent('3')
    } finally {
      vi.useRealTimers()
    }
  })

  // Moving from the label onto the dot has to retract the card, not leave the two stacked.
  it('retracts an open working-directory card when the pointer reaches the dot', () => {
    vi.useFakeTimers()
    try {
      render(<WorktreeItem wt={worktree()} wipStatus={WIP} />)
      fireEvent.mouseEnter(screen.getByTestId(`worktree-item-${PATH}`))
      act(() => vi.advanceTimersByTime(500))
      expect(screen.getByTestId(`worktree-hover-card-${PATH}`)).toBeInTheDocument()

      fireEvent.mouseEnter(screen.getByTestId(`worktree-changes-bubble-${PATH}`))
      act(() => vi.advanceTimersByTime(1))

      expect(screen.queryByTestId(`worktree-hover-card-${PATH}`)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets the working-directory card open again once the pointer leaves the dot', () => {
    vi.useFakeTimers()
    try {
      render(<WorktreeItem wt={worktree()} wipStatus={WIP} />)
      const dot = screen.getByTestId(`worktree-changes-bubble-${PATH}`)
      fireEvent.mouseEnter(dot)
      act(() => vi.advanceTimersByTime(500))
      fireEvent.mouseLeave(dot)

      fireEvent.mouseEnter(screen.getByTestId(`worktree-item-${PATH}`))
      act(() => vi.advanceTimersByTime(500))

      expect(screen.getByTestId(`worktree-hover-card-${PATH}`)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('WorktreeItem — actions menu', () => {
  async function openMenu() {
    const user = userEvent.setup()
    await user.click(screen.getByTestId(`worktree-actions-button-${PATH}`))
    return user
  }

  it('opens the worktree in place', async () => {
    const onOpenWorktree = vi.fn()
    const wt = worktree()
    render(<WorktreeItem wt={wt} onOpenWorktree={onOpenWorktree} />)
    const user = await openMenu()

    await user.click(screen.getByTestId(`worktree-open-${PATH}`))

    expect(onOpenWorktree).toHaveBeenCalledWith(wt)
  })

  it('opens the worktree path as its own tab', async () => {
    render(<WorktreeItem wt={worktree()} />)
    const user = await openMenu()

    await user.click(screen.getByTestId(`worktree-open-new-tab-${PATH}`))

    expect(openRepoTab).toHaveBeenCalledWith(PATH)
  })

  it('removes the worktree', async () => {
    const onRemoveWorktree = vi.fn()
    const wt = worktree()
    render(<WorktreeItem wt={wt} onRemoveWorktree={onRemoveWorktree} />)
    const user = await openMenu()

    await user.click(screen.getByTestId(`worktree-remove-${PATH}`))

    expect(onRemoveWorktree).toHaveBeenCalledWith(wt)
  })

  it('removes the worktree and its branch through a distinct action', async () => {
    const onRemoveWorktree = vi.fn()
    const onRemoveWorktreeAndBranch = vi.fn()
    const wt = worktree()
    render(
      <WorktreeItem
        wt={wt}
        onRemoveWorktree={onRemoveWorktree}
        onRemoveWorktreeAndBranch={onRemoveWorktreeAndBranch}
      />
    )
    const user = await openMenu()

    await user.click(screen.getByTestId(`worktree-remove-with-branch-${PATH}`))

    expect(onRemoveWorktreeAndBranch).toHaveBeenCalledWith(wt)
    expect(onRemoveWorktree).not.toHaveBeenCalled()
  })

  it('offers the four actions in the order they were specified', async () => {
    render(
      <WorktreeItem
        wt={worktree()}
        onOpenWorktree={vi.fn()}
        onRemoveWorktree={vi.fn()}
        onRemoveWorktreeAndBranch={vi.fn()}
      />
    )
    await openMenu()

    const labels = screen.getAllByRole('menuitem').map((i) => i.textContent)
    expect(labels).toEqual([
      'Open this worktree',
      'Open worktree in new tab',
      'Copy path',
      'Copy SHA',
      'Remove this worktree',
      'Remove worktree and delete branch',
    ])
  })
})

describe('WorktreeItem — row behaviour', () => {
  it('opens the worktree on double-click but not on a single click', () => {
    const onOpenWorktree = vi.fn()
    const wt = worktree()
    render(<WorktreeItem wt={wt} onOpenWorktree={onOpenWorktree} />)
    const row = screen.getByTestId(`worktree-item-${PATH}`)

    fireEvent.click(row)
    expect(onOpenWorktree).not.toHaveBeenCalled()

    fireEvent.doubleClick(row)
    expect(onOpenWorktree).toHaveBeenCalledWith(wt)
  })

  it('shows a lock icon for a locked worktree', () => {
    const { container } = render(<WorktreeItem wt={worktree({ isLocked: true })} />)
    expect(container.querySelector('.lucide-lock')).toBeTruthy()
  })

  it('highlights the matched substring in the branch label', () => {
    const { container } = render(<WorktreeItem wt={worktree()} filterQuery="login" />)
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('login')
  })
})
