import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitBranch, GitRef, GitStash, PullRequest, GitSubmodule } from '@git-manager/git-types'
import type { SidebarRow } from './types'
import { SidebarRowView } from './SidebarRowView'

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
  }) => (
    <button
      data-testid="pr-item"
      data-selected={String(props.isSelected)}
      onClick={() => props.onOpen?.(props.pr)}
    >
      {props.pr.title}
    </button>
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

function baseHandlers() {
  return {
    onToggleOpen: vi.fn(),
    onSelectBranch: vi.fn(),
    onTogglePin: vi.fn(),
    onContextMenu: vi.fn(),
    onOpenPr: vi.fn(),
    onCreateBranch: vi.fn(),
    onStashContextMenu: vi.fn(),
    onToggleStashVisibility: vi.fn(),
  }
}

function renderRow(row: SidebarRow, handlers: Partial<ReturnType<typeof baseHandlers>> = {}) {
  const h = { ...baseHandlers(), ...handlers }
  const utils = render(<SidebarRowView row={row} {...h} />)
  return { ...utils, h }
}

describe('SidebarRowView — section', () => {
  it('renders the section header with title/count and toggles via onToggleOpen', async () => {
    const user = userEvent.setup()
    const { h } = renderRow({
      kind: 'section',
      id: 'sec-local',
      sectionKey: 'local',
      title: 'Local',
      count: 3,
      isOpen: true,
    })
    expect(screen.getByText('Local')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    await user.click(screen.getByText('Local'))
    expect(h.onToggleOpen).toHaveBeenCalledWith('sec-local')
  })

  it('shows the create-branch action only for the local section with onCreateBranch', async () => {
    const user = userEvent.setup()
    const { h } = renderRow({
      kind: 'section',
      id: 'sec-local',
      sectionKey: 'local',
      title: 'Local',
      isOpen: true,
    })
    await user.click(screen.getByLabelText('Créer une branche'))
    expect(h.onCreateBranch).toHaveBeenCalledOnce()
  })

  it('hides the create-branch action for a non-local section', () => {
    renderRow({
      kind: 'section',
      id: 'sec-remotes',
      sectionKey: 'remotes',
      title: 'Remotes',
      isOpen: true,
    })
    expect(screen.queryByLabelText('Créer une branche')).not.toBeInTheDocument()
  })
})

describe('SidebarRowView — branch', () => {
  it('forwards branch/isSelected/depth/isPinned to BranchItem', () => {
    renderRow({
      kind: 'branch',
      id: 'b-main',
      branch: branch(),
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
    expect(screen.getByText('feature/')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('●')).toBeInTheDocument()
    await user.click(screen.getByText('feature/'))
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

  it('toggles visibility via the hover button without selecting the stash', () => {
    const { h } = renderRow({
      kind: 'stash',
      id: 's-1',
      stash: stash({ commitOid: 'stashoid1234567' }),
      isSelected: false,
    })
    fireEvent.click(screen.getByLabelText('Masquer le stash dans le graphe'))
    expect(h.onToggleStashVisibility).toHaveBeenCalledWith('stashoid1234567')
    expect(h.onSelectBranch).not.toHaveBeenCalled()
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
