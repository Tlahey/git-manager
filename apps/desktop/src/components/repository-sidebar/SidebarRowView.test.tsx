import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  GitBranch,
  GitRef,
  GitStash,
  PullRequest,
  GitSubmodule,
  GitWorktree,
} from '@git-manager/git-types'
import type { SidebarRow } from './types'
import { renderWithLanguage } from '../../test/i18n'
import { SidebarRowView } from './SidebarRowView'

// Partial-mock so the real Radix components still render; only `toast` is spied on.
vi.mock('@git-manager/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@git-manager/ui')>()
  return {
    ...actual,
    toast: Object.assign(vi.fn(), {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      dismiss: vi.fn(),
    }),
  }
})
import { toast } from '@git-manager/ui'
const mockedToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
}

vi.mock('./HoverExpandLabel', () => ({
  HoverExpandLabel: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => <span className={className}>{children}</span>,
}))
vi.mock('./BranchItem', () => ({
  BranchItem: (props: Record<string, unknown>) => (
    <div
      data-testid="branch-item"
      data-props={JSON.stringify({
        isSelected: props.isSelected,
        depth: props.depth,
        isPinned: props.isPinned,
      })}
    />
  ),
}))
vi.mock('./PullRequestItem', () => ({
  PullRequestItem: (props: {
    pr: PullRequest
    isSelected?: boolean
    onOpen?: (pr: PullRequest) => void
    repoPath?: string
    depth?: 0 | 1
    onContextMenu?: (e: unknown, pr: PullRequest) => void
  }) => (
    <button
      data-testid="pr-item"
      data-selected={String(props.isSelected)}
      data-repo-path={props.repoPath}
      data-depth={String(props.depth)}
      onClick={() => props.onOpen?.(props.pr)}
      onContextMenu={(e) => props.onContextMenu?.(e, props.pr)}
    >
      {props.pr.title}
    </button>
  ),
}))
vi.mock('./IssueItem', () => ({
  IssueItem: (props: {
    issue: { number: number; title: string }
    filterQuery?: string
    onContextMenu?: (e: unknown, issue: unknown) => void
    onOpen?: (issue: unknown) => void
  }) => (
    <div
      data-testid="issue-item"
      data-filter={props.filterQuery}
      data-has-menu={String(!!props.onContextMenu)}
      onContextMenu={(e) => props.onContextMenu?.(e, props.issue)}
      onClick={() => props.onOpen?.(props.issue)}
    >
      {props.issue.title}
    </div>
  ),
}))

function branch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'refs/heads/main',
    shortName: 'main',
    isHead: false,
    isRemote: false,
    commitOid: '',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}
function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'PR title',
    body: '',
    state: 'open',
    author: 'a',
    authorAvatar: '',
    headRef: 'h',
    baseRef: 'b',
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
function tag(overrides: Partial<GitRef> = {}): GitRef {
  return {
    name: 'refs/tags/v1',
    shortName: 'v1',
    type: 'tag',
    commitOid: 'abcdef1234567890',
    ...overrides,
  }
}
function stash(overrides: Partial<GitStash> = {}): GitStash {
  return {
    index: 0,
    message: 'WIP on main',
    branch: 'main',
    commitOid: 'stashoid1234567',
    timestamp: 0,
    filesCount: 1,
    additions: 0,
    deletions: 0,
    ...overrides,
  }
}
function submodule(overrides: Partial<GitSubmodule> = {}): GitSubmodule {
  return {
    path: 'vendor/lib',
    url: 'git@github.com:owner/lib.git',
    headOid: 'abcdef1234567890',
    ...overrides,
  }
}
function worktree(overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: '/tmp/repo-linked',
    branch: 'feature/login',
    commitOid: 'abcdef1234567890',
    isMain: false,
    isLocked: false,
    isDirty: false,
    isPrunable: false,
    ...overrides,
  }
}

function baseHandlers() {
  return {
    onToggleOpen: vi.fn(),
    onSelectBranch: vi.fn(),
    onTogglePin: vi.fn(),
    onContextMenu: vi.fn(),
    onOpenPr: vi.fn(),
    onStashContextMenu: vi.fn(),
    onToggleStashVisibility: vi.fn(),
    onRemoveWorktree: vi.fn(),
    onOpenWorktree: vi.fn(),
  }
}

// Accepts any of the component's props, not just the shared handlers, so a test can wire one of the
// row-specific callbacks (issue menu, filter menu…) without them leaking into every other test.
// Generic so the returned handlers keep their precise types: the shared ones stay `Mock` (tests
// call `.mockClear()` on them) while an override contributes its own type.
function renderRow<T extends Partial<React.ComponentProps<typeof SidebarRowView>>>(
  row: SidebarRow,
  handlers: T = {} as T
) {
  const h = { ...baseHandlers(), ...handlers }
  const utils = render(<SidebarRowView row={row} {...h} />)
  return { ...utils, h }
}

describe('SidebarRowView — branch', () => {
  it('forwards branch/isSelected/depth/isPinned to BranchItem', () => {
    renderRow({
      kind: 'branch',
      id: 'b-main',
      branch: branch(),
      displayName: 'main',
      isSelected: true,
      depth: 1,
      isPinned: true,
    })
    const item = screen.getByTestId('branch-item')
    expect(JSON.parse(item.dataset.props!)).toEqual({ isSelected: true, depth: 1, isPinned: true })
  })
})

describe('SidebarRowView — folder', () => {
  it('shows the prefix, count, HEAD dot, and toggles on click', async () => {
    const user = userEvent.setup()
    const { h } = renderRow({
      kind: 'folder',
      id: 'f-feature',
      prefix: 'feature/',
      count: 4,
      isOpen: false,
      hasHead: true,
    })
    expect(screen.getByText('feature')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('●')).toBeInTheDocument()
    await user.click(screen.getByText('feature'))
    expect(h.onToggleOpen).toHaveBeenCalledWith('f-feature')
  })

  it('hides the HEAD dot when hasHead is false', () => {
    renderRow({
      kind: 'folder',
      id: 'f-feature',
      prefix: 'feature/',
      count: 1,
      isOpen: false,
      hasHead: false,
    })
    expect(screen.queryByText('●')).not.toBeInTheDocument()
  })
})

describe('SidebarRowView — remote-group', () => {
  it('shows the remote name/count and toggles on click', async () => {
    const user = userEvent.setup()
    const { h } = renderRow({
      kind: 'remote-group',
      id: 'rg-origin',
      remoteName: 'origin',
      count: 2,
      isOpen: true,
    })
    expect(screen.getByText('origin')).toBeInTheDocument()
    await user.click(screen.getByText('origin'))
    expect(h.onToggleOpen).toHaveBeenCalledWith('rg-origin')
  })
})

describe('SidebarRowView — remote-branch', () => {
  it('strips the remote prefix and selects using the full branch name on click/Enter', () => {
    const { h } = renderRow({
      kind: 'remote-branch',
      id: 'rb-1',
      branch: branch({ name: 'refs/remotes/origin/main', shortName: 'origin/main' }),
      remoteName: 'origin',
      isSelected: false,
    })
    expect(screen.getByText('main')).toBeInTheDocument()
    const row = screen.getByText('main').closest('[role="button"]')!
    fireEvent.click(row)
    expect(h.onSelectBranch).toHaveBeenCalledWith('refs/remotes/origin/main')
  })

  it('shows ahead/behind counters', () => {
    renderRow({
      kind: 'remote-branch',
      id: 'rb-1',
      branch: branch({ shortName: 'origin/main', aheadCount: 2, behindCount: 1 }),
      remoteName: 'origin',
      isSelected: false,
    })
    expect(screen.getByText('↑2')).toBeInTheDocument()
    expect(screen.getByText('↓1')).toBeInTheDocument()
  })
})

describe('SidebarRowView — subgroup', () => {
  it('shows the label/count and toggles on click', async () => {
    const user = userEvent.setup()
    const { h } = renderRow({
      kind: 'subgroup',
      id: 'sg-1',
      label: 'OTHERS',
      count: 5,
      isOpen: false,
    })
    expect(screen.getByText('OTHERS')).toBeInTheDocument()
    await user.click(screen.getByText('OTHERS'))
    expect(h.onToggleOpen).toHaveBeenCalledWith('sg-1')
  })

  // The PR sub-groups are fixed; only a saved issue filter is editable, so only it gets a button.
  it('carries no actions button when the sub-group is not a saved filter', () => {
    renderRow(
      { kind: 'subgroup', id: 'sg-1', label: 'OTHERS', count: 5, isOpen: false },
      { onIssueFilterMenu: vi.fn() }
    )
    expect(screen.queryByLabelText('Filter actions')).not.toBeInTheDocument()
  })

  it('opens the filter menu from the sub-group button, with its move limits', async () => {
    const user = userEvent.setup()
    const onIssueFilterMenu = vi.fn()
    const filter = { id: 'f1', name: 'Bugs', query: 'label:bug' }
    renderRow(
      {
        kind: 'subgroup',
        id: 'issue-filter:f1',
        label: 'Bugs',
        count: 2,
        isOpen: true,
        filter,
        canMoveUp: false,
        canMoveDown: true,
      },
      { onIssueFilterMenu }
    )

    await user.click(screen.getByTestId('issue-filter-actions-f1'))

    expect(onIssueFilterMenu).toHaveBeenCalledWith(expect.anything(), {
      filter,
      canMoveUp: false,
      canMoveDown: true,
    })
  })

  // Clicking the actions button must not also collapse the group under it.
  it('does not toggle the sub-group when its actions button is clicked', async () => {
    const user = userEvent.setup()
    const { h } = renderRow(
      {
        kind: 'subgroup',
        id: 'issue-filter:f1',
        label: 'Bugs',
        count: 2,
        isOpen: true,
        filter: { id: 'f1', name: 'Bugs', query: 'label:bug' },
      },
      { onIssueFilterMenu: vi.fn() }
    )

    await user.click(screen.getByTestId('issue-filter-actions-f1'))

    expect(h.onToggleOpen).not.toHaveBeenCalled()
  })
})

describe('SidebarRowView — pr', () => {
  it('forwards pr/isSelected/onOpen to PullRequestItem', async () => {
    const user = userEvent.setup()
    const item = pr({ title: 'Fix the thing' })
    const { h } = renderRow({ kind: 'pr', id: 'pr-1', pr: item, isSelected: true })
    expect(screen.getByTestId('pr-item')).toHaveAttribute('data-selected', 'true')
    await user.click(screen.getByText('Fix the thing'))
    expect(h.onOpenPr).toHaveBeenCalledWith(item)
  })

  // The PR row resolves its own `owner/repo` for the hover card's review lookup.
  it('forwards repoPath and the sub-group depth to PullRequestItem', () => {
    render(
      <SidebarRowView
        row={{ kind: 'pr', id: 'pr-1', pr: pr(), isSelected: false, depth: 1 }}
        repoPath="/repo"
        {...baseHandlers()}
      />
    )
    expect(screen.getByTestId('pr-item')).toHaveAttribute('data-repo-path', '/repo')
    expect(screen.getByTestId('pr-item')).toHaveAttribute('data-depth', '1')
  })
})

describe('SidebarRowView — pr actions', () => {
  it('forwards the pull request action menu to the row', () => {
    const onPrContextMenu = vi.fn()
    const item = pr()
    renderRow({ kind: 'pr', id: 'pr-1', pr: item, isSelected: false }, { onPrContextMenu })

    fireEvent.contextMenu(screen.getByTestId('pr-item'))

    expect(onPrContextMenu).toHaveBeenCalledWith(expect.anything(), item)
  })
})

describe('SidebarRowView — issue', () => {
  const issue = {
    id: 'gh-issue-12',
    number: 12,
    title: 'Scroll position lost',
    repo: 'repo',
    url: '',
    status: 'open' as const,
    author: 'marie',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    comments: 0,
    thumbsUp: 0,
  }

  it('renders an IssueItem for an issue row', () => {
    renderRow({ kind: 'issue', id: 'issue-12', issue })
    expect(screen.getByTestId('issue-item')).toHaveTextContent('Scroll position lost')
  })

  it('forwards the active filter query so the title can highlight the match', () => {
    render(
      <SidebarRowView
        row={{ kind: 'issue', id: 'issue-12', issue }}
        filterQuery="scroll"
        {...baseHandlers()}
      />
    )
    expect(screen.getByTestId('issue-item')).toHaveAttribute('data-filter', 'scroll')
  })

  it('forwards the in-app open handler to the row', () => {
    const onOpenIssue = vi.fn()
    renderRow({ kind: 'issue', id: 'issue-12', issue }, { onOpenIssue })

    fireEvent.click(screen.getByTestId('issue-item'))

    expect(onOpenIssue).toHaveBeenCalledWith(issue)
  })

  it('forwards the issue action menu to the row', () => {
    const onIssueContextMenu = vi.fn()
    renderRow({ kind: 'issue', id: 'issue-12', issue }, { onIssueContextMenu })

    fireEvent.contextMenu(screen.getByTestId('issue-item'))

    expect(onIssueContextMenu).toHaveBeenCalledWith(expect.anything(), issue)
  })
})

describe('SidebarRowView — tag', () => {
  it('shows the short name and short oid, selects on click/Enter', () => {
    const { h } = renderRow({
      kind: 'tag',
      id: 't-1',
      tag: tag({ name: 'refs/tags/v1.0.0', shortName: 'v1.0.0', commitOid: 'abcdef1234567890' }),
      isSelected: false,
    })
    expect(screen.getByText('v1.0.0')).toBeInTheDocument()
    expect(screen.getByText('abcdef1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('v1.0.0').closest('[role="button"]')!)
    expect(h.onSelectBranch).toHaveBeenCalledWith('refs/tags/v1.0.0')
  })

  it('scrolls to the tag commit via onSelectTag (not onSelectBranch) when provided', () => {
    const h = baseHandlers()
    const onSelectTag = vi.fn()
    render(
      <SidebarRowView
        row={{
          kind: 'tag',
          id: 't-1',
          tag: tag({ name: 'refs/tags/v1.0.0', shortName: 'v1.0.0', commitOid: 'abcdef1234567890' }),
          isSelected: false,
        }}
        {...h}
        onSelectTag={onSelectTag}
      />
    )
    fireEvent.click(screen.getByText('v1.0.0').closest('[role="button"]')!)
    expect(onSelectTag).toHaveBeenCalledWith('abcdef1234567890')
    expect(h.onSelectBranch).not.toHaveBeenCalled()
  })

  it('highlights the matched substring when filterQuery is provided', () => {
    const { container } = renderRow(
      { kind: 'tag', id: 't-1', tag: tag({ shortName: 'v1.0.0' }), isSelected: false },
      {}
    )
    expect(container.querySelector('mark')).toBeFalsy()

    const { container: filteredContainer } = render(
      <SidebarRowView
        row={{ kind: 'tag', id: 't-1', tag: tag({ shortName: 'v1.0.0' }), isSelected: false }}
        {...baseHandlers()}
        filterQuery="1.0"
      />
    )
    expect(filteredContainer.querySelector('mark')?.textContent).toBe('1.0')
  })
})

describe('SidebarRowView — tag visibility and actions', () => {
  // Not annotated as `SidebarRow`: the union would hide `.tag` from the assertions below.
  const tagRow = () => ({ kind: 'tag' as const, id: 't-1', tag: tag(), isSelected: false })

  it('hides the visibility toggle at rest but reveals it on hover', () => {
    renderRow(tagRow())
    const toggle = screen.getByLabelText('Hide this tag from the graph')
    expect(toggle.className).toContain('opacity-0')
    expect(toggle.className).toContain('group-hover/tag:opacity-100')
  })

  // Same reasoning as the stash: once hidden, the icon is the only thing saying so.
  it('pins the toggle on screen and dims the row once the tag is hidden', () => {
    const { container } = render(
      <SidebarRowView row={tagRow()} {...baseHandlers()} hiddenTags={['v1']} />
    )
    const toggle = screen.getByLabelText('Show this tag in the graph')
    expect(toggle.className).toContain('opacity-100')
    expect(toggle.className).not.toContain('opacity-0')
    expect(container.querySelector('.lucide-eye-off')).toBeTruthy()
    expect(container.querySelector('.opacity-50')).toBeTruthy()
  })

  it('toggles visibility by tag name, without selecting the tag', () => {
    const onToggleTagVisibility = vi.fn()
    const onSelectTag = vi.fn()
    render(
      <SidebarRowView
        row={tagRow()}
        {...baseHandlers()}
        onSelectTag={onSelectTag}
        onToggleTagVisibility={onToggleTagVisibility}
      />
    )

    fireEvent.click(screen.getByLabelText('Hide this tag from the graph'))

    expect(onToggleTagVisibility).toHaveBeenCalledWith('v1')
    expect(onSelectTag).not.toHaveBeenCalled()
  })

  it('opens the tag menu from the hover "…" button and from right-click alike', async () => {
    const user = userEvent.setup()
    const onTagContextMenu = vi.fn()
    const row = tagRow()
    render(<SidebarRowView row={row} {...baseHandlers()} onTagContextMenu={onTagContextMenu} />)

    const button = screen.getByTestId('tag-actions-button-v1')
    expect(button.className).toContain('opacity-0')
    expect(button.className).toContain('group-hover/tag:opacity-100')

    await user.click(button)
    expect(onTagContextMenu).toHaveBeenCalledWith(expect.anything(), row.tag)

    onTagContextMenu.mockClear()
    fireEvent.contextMenu(screen.getByTestId('tag-item-v1'))
    expect(onTagContextMenu).toHaveBeenCalledWith(expect.anything(), row.tag)
  })

  it('neither affordance selects the tag', async () => {
    const user = userEvent.setup()
    const onSelectTag = vi.fn()
    render(
      <SidebarRowView
        row={tagRow()}
        {...baseHandlers()}
        onSelectTag={onSelectTag}
        onTagContextMenu={vi.fn()}
        onToggleTagVisibility={vi.fn()}
      />
    )

    await user.click(screen.getByTestId('tag-actions-button-v1'))
    await user.click(screen.getByLabelText('Hide this tag from the graph'))
    expect(onSelectTag).not.toHaveBeenCalled()

    // The row itself still selects, so the guards above are scoped and not a blanket block.
    await user.click(screen.getByText('v1'))
    expect(onSelectTag).toHaveBeenCalledWith('abcdef1234567890')
  })
})

describe('SidebarRowView — stash', () => {
  it('shows the message and short oid, selects by commitOid on click', () => {
    const { h } = renderRow({
      kind: 'stash',
      id: 's-1',
      stash: stash({ message: 'WIP on main', commitOid: 'stashoid1234567' }),
      isSelected: false,
    })
    expect(screen.getByText('WIP on main')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('stash-item-0'))
    expect(h.onSelectBranch).toHaveBeenCalledWith('stashoid1234567')
  })

  it('highlights the matched substring in the message when filterQuery is provided', () => {
    const { container } = render(
      <SidebarRowView
        row={{
          kind: 'stash',
          id: 's-1',
          stash: stash({ message: 'WIP on main' }),
          isSelected: false,
        }}
        {...baseHandlers()}
        filterQuery="on main"
      />
    )
    expect(container.querySelector('mark')?.textContent).toBe('on main')
  })

  it('falls back to "stash@{index}" when the stash has no message', () => {
    renderRow({
      kind: 'stash',
      id: 's-1',
      stash: stash({ message: '', index: 2 }),
      isSelected: false,
    })
    expect(screen.getByText('stash@{2}')).toBeInTheDocument()
  })

  it('opens the context menu without selecting', () => {
    const { h } = renderRow({ kind: 'stash', id: 's-1', stash: stash(), isSelected: false })
    fireEvent.contextMenu(screen.getByTestId('stash-item-0'))
    expect(h.onStashContextMenu).toHaveBeenCalled()
    expect(h.onSelectBranch).not.toHaveBeenCalled()
  })

  // Right-click was the only way into the stash actions, which a hover-only affordance can't
  // advertise. The button opens the very same menu rather than a second definition of it.
  it('offers the same actions from a hover "…" button', async () => {
    const user = userEvent.setup()
    const item = stash()
    const { h } = renderRow({ kind: 'stash', id: 's-1', stash: item, isSelected: false })

    const button = screen.getByTestId('stash-actions-button-0')
    expect(button.className).toContain('opacity-0')
    expect(button.className).toContain('group-hover/stash:opacity-100')

    await user.click(button)
    expect(h.onStashContextMenu).toHaveBeenCalledWith(expect.anything(), item)
  })

  it('the "…" button does not select the stash, by click or by keyboard', async () => {
    const user = userEvent.setup()
    const { h } = renderRow({ kind: 'stash', id: 's-1', stash: stash(), isSelected: false })
    const button = screen.getByTestId('stash-actions-button-0')

    await user.click(button)
    expect(h.onSelectBranch).not.toHaveBeenCalled()

    h.onStashContextMenu.mockClear()
    button.focus()
    await user.keyboard('{Enter}')
    expect(h.onStashContextMenu).toHaveBeenCalled()
    expect(h.onSelectBranch).not.toHaveBeenCalled()
  })

  it('toggles visibility via the hover button without selecting the stash', () => {
    const { h } = renderRow({
      kind: 'stash',
      id: 's-1',
      stash: stash({ commitOid: 'stashoid1234567' }),
      isSelected: false,
    })
    fireEvent.click(screen.getByLabelText('Hide this stash from the graph'))
    expect(h.onToggleStashVisibility).toHaveBeenCalledWith('stashoid1234567')
    expect(h.onSelectBranch).not.toHaveBeenCalled()
  })

  // The toggle is icon-only, so its label is the only thing naming the action — and it used to be
  // hardcoded French, which read as French even with the app in English.
  it('labels the visibility toggle in the active language, flipping with the state', () => {
    const visibleRow = {
      kind: 'stash' as const,
      id: 's-1',
      stash: stash({ commitOid: 'stashoid1234567' }),
      isSelected: false,
    }
    renderRow(visibleRow)
    const toggle = screen.getByLabelText('Hide this stash from the graph')
    expect(toggle).toHaveAttribute('title', 'Hide this stash from the graph')

    render(
      <SidebarRowView
        row={visibleRow}
        {...baseHandlers()}
        hiddenStashes={['stashoid1234567']}
      />
    )
    expect(screen.getByLabelText('Show this stash in the graph')).toBeInTheDocument()
  })

  it('translates the visibility toggle when the language is French', () => {
    renderWithLanguage(
      <SidebarRowView
        row={{
          kind: 'stash',
          id: 's-1',
          stash: stash({ commitOid: 'stashoid1234567' }),
          isSelected: false,
        }}
        {...baseHandlers()}
      />,
      'fr'
    )
    expect(screen.getByLabelText('Masquer ce stash du graphe')).toBeInTheDocument()
  })

  it('shows the hidden (EyeOff) state and dims the row when hiddenStashes includes it', () => {
    const { container } = renderRow(
      {
        kind: 'stash',
        id: 's-1',
        stash: stash({ commitOid: 'stashoid1234567' }),
        isSelected: false,
      },
      {}
    )
    expect(container.querySelector('.lucide-eye')).toBeTruthy()

    const { container: hiddenContainer } = render(
      <SidebarRowView
        row={{
          kind: 'stash',
          id: 's-1',
          stash: stash({ commitOid: 'stashoid1234567' }),
          isSelected: false,
        }}
        {...baseHandlers()}
        hiddenStashes={['stashoid1234567']}
      />
    )
    expect(hiddenContainer.querySelector('.lucide-eye-off')).toBeTruthy()
    expect(hiddenContainer.querySelector('.opacity-50')).toBeTruthy()
  })

  // The toggle is a hover affordance on a visible stash, but on a hidden one it is the only thing
  // saying so — leaving it to appear under the pointer would make that state invisible at rest.
  it('keeps the visibility toggle on screen at rest once the stash is hidden', () => {
    const row = {
      kind: 'stash' as const,
      id: 's-1',
      stash: stash({ commitOid: 'stashoid1234567' }),
      isSelected: false,
    }

    renderRow(row)
    const shownToggle = screen.getByLabelText('Hide this stash from the graph')
    expect(shownToggle.className).toContain('opacity-0')
    expect(shownToggle.className).toContain('group-hover/stash:opacity-100')

    render(
      <SidebarRowView row={row} {...baseHandlers()} hiddenStashes={['stashoid1234567']} />
    )
    const hiddenToggle = screen.getByLabelText('Show this stash in the graph')
    expect(hiddenToggle.className).toContain('opacity-100')
    expect(hiddenToggle.className).not.toContain('opacity-0')
  })
})

describe('SidebarRowView — submodule', () => {
  it('shows the path, shortened URL, and short head oid', () => {
    renderRow({
      kind: 'submodule',
      id: 'sm-1',
      sm: submodule({
        path: 'vendor/lib',
        url: 'git@github.com:owner/lib.git',
        headOid: 'abcdef1234567890',
      }),
    })
    expect(screen.getByText('vendor/lib')).toBeInTheDocument()
    expect(screen.getByText('github.com:owner/lib')).toBeInTheDocument()
    expect(screen.getByText('abcdef1')).toBeInTheDocument()
  })

  it('omits the head-oid badge when absent', () => {
    renderRow({ kind: 'submodule', id: 'sm-1', sm: submodule({ headOid: '' }) })
    expect(screen.queryByText('abcdef1')).not.toBeInTheDocument()
  })

  it('highlights the matched substring in the path when filterQuery is provided', () => {
    const { container } = render(
      <SidebarRowView
        row={{ kind: 'submodule', id: 'sm-1', sm: submodule({ path: 'vendor/lib' }) }}
        {...baseHandlers()}
        filterQuery="vendor"
      />
    )
    expect(container.querySelector('mark')?.textContent).toBe('vendor')
  })
})

describe('SidebarRowView — worktree', () => {
  it('shows only the branch label — no path, no commit oid', () => {
    renderRow({
      kind: 'worktree',
      id: 'wt-1',
      wt: worktree({ branch: 'feature/login', path: '/tmp/repo-linked' }),
    })
    expect(screen.getByText('feature/login')).toBeInTheDocument()
    expect(screen.queryByText('/tmp/repo-linked')).not.toBeInTheDocument()
    expect(screen.queryByText('abcdef1')).not.toBeInTheDocument()
  })

  it('shows a lock icon when locked', () => {
    const { container } = renderRow({
      kind: 'worktree',
      id: 'wt-1',
      wt: worktree({ isLocked: true }),
    })
    expect(container.querySelector('.lucide-lock')).toBeTruthy()
  })

  it('calls onRemoveWorktree from the actions menu Delete item', async () => {
    const user = userEvent.setup()
    const wt = worktree({ path: '/tmp/repo-linked' })
    const { h } = renderRow({ kind: 'worktree', id: 'wt-1', wt })
    await user.click(screen.getByTestId('worktree-actions-button-/tmp/repo-linked'))
    await user.click(screen.getByTestId('worktree-remove-/tmp/repo-linked'))
    expect(h.onRemoveWorktree).toHaveBeenCalledWith(wt)
  })

  it('copies the path and the SHA from the actions menu, each with a confirmation toast', async () => {
    mockedToast.success.mockClear()
    const user = userEvent.setup()
    // Defined after setup(): userEvent installs its own clipboard stub on navigator during setup.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const wt = worktree({ path: '/tmp/repo-linked', commitOid: 'abcdef1234567890' })
    renderRow({ kind: 'worktree', id: 'wt-1', wt })

    await user.click(screen.getByTestId('worktree-actions-button-/tmp/repo-linked'))
    await user.click(screen.getByTestId('worktree-copy-path-/tmp/repo-linked'))
    expect(writeText).toHaveBeenCalledWith('/tmp/repo-linked')
    await waitFor(() =>
      expect(mockedToast.success).toHaveBeenCalledWith('Path copied to clipboard', {
        description: '/tmp/repo-linked',
      })
    )

    await user.click(screen.getByTestId('worktree-actions-button-/tmp/repo-linked'))
    await user.click(screen.getByTestId('worktree-copy-sha-/tmp/repo-linked'))
    expect(writeText).toHaveBeenCalledWith('abcdef1234567890')
    await waitFor(() =>
      expect(mockedToast.success).toHaveBeenCalledWith('SHA copied to clipboard', {
        description: 'abcdef1234567890',
      })
    )
  })

  it('calls onOpenWorktree with the worktree when the row is double-clicked', () => {
    const wt = worktree({ path: '/tmp/repo-linked' })
    const { h } = renderRow({ kind: 'worktree', id: 'wt-1', wt })
    fireEvent.doubleClick(screen.getByTestId('worktree-item-/tmp/repo-linked'))
    expect(h.onOpenWorktree).toHaveBeenCalledWith(wt)
  })

  it('does nothing on a single click of the row', () => {
    const wt = worktree({ path: '/tmp/repo-linked' })
    const { h } = renderRow({ kind: 'worktree', id: 'wt-1', wt })
    fireEvent.click(screen.getByTestId('worktree-item-/tmp/repo-linked'))
    expect(h.onOpenWorktree).not.toHaveBeenCalled()
  })

  it('opening the actions menu does not trigger onOpenWorktree', async () => {
    const user = userEvent.setup()
    const wt = worktree({ path: '/tmp/repo-linked' })
    const { h } = renderRow({ kind: 'worktree', id: 'wt-1', wt })
    await user.click(screen.getByTestId('worktree-actions-button-/tmp/repo-linked'))
    expect(h.onOpenWorktree).not.toHaveBeenCalled()
  })

  it('shows an instant tooltip with the add/change/delete breakdown when the bubble is hovered', () => {
    vi.useFakeTimers()
    try {
      render(
        <SidebarRowView
          row={{ kind: 'worktree', id: 'wt-1', wt: worktree({ path: '/tmp/repo-linked' }) }}
          {...baseHandlers()}
          worktreeWipStatuses={[
            {
              path: '/tmp/repo-linked',
              branch: 'feature/login',
              totalChanges: 10,
              added: 3,
              modified: 5,
              deleted: 2,
            },
          ]}
        />
      )
      // No tooltip until hover; delay={0} means it appears on the next tick, not after a wait.
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      fireEvent.mouseEnter(screen.getByTestId('worktree-changes-bubble-/tmp/repo-linked'))
      act(() => vi.advanceTimersByTime(1))

      const tip = screen.getByRole('tooltip')
      expect(tip).toHaveTextContent('3')
      expect(tip).toHaveTextContent('5')
      expect(tip).toHaveTextContent('2')
      // One icon each for add / change / delete.
      expect(tip.querySelectorAll('svg')).toHaveLength(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows no bubble when there is no matching pending-changes entry', () => {
    render(
      <SidebarRowView
        row={{ kind: 'worktree', id: 'wt-1', wt: worktree({ path: '/tmp/repo-linked' }) }}
        {...baseHandlers()}
        worktreeWipStatuses={[]}
      />
    )
    expect(screen.queryByTestId('worktree-changes-bubble-/tmp/repo-linked')).not.toBeInTheDocument()
  })

  it('highlights the matched substring in the branch label when filterQuery is provided', () => {
    const { container } = render(
      <SidebarRowView
        row={{
          kind: 'worktree',
          id: 'wt-1',
          wt: worktree({ branch: 'feature/login', path: '/tmp/repo-linked' }),
        }}
        {...baseHandlers()}
        filterQuery="login"
      />
    )
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('login')
  })
})

describe('SidebarRowView — message and divider', () => {
  it('shows the message text, with a spinner only when loading', () => {
    const { container, rerender } = renderRow({
      kind: 'message',
      id: 'm-1',
      text: 'Loading branches…',
      loading: true,
    })
    expect(screen.getByText('Loading branches…')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeTruthy()

    rerender(
      <SidebarRowView
        row={{ kind: 'message', id: 'm-1', text: 'No branches' }}
        {...baseHandlers()}
      />
    )
    expect(screen.getByText('No branches')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeFalsy()
  })

  it('renders a divider with no content', () => {
    const { container } = renderRow({ kind: 'divider', id: 'd-1' })
    expect(container.textContent).toBe('')
  })
})
