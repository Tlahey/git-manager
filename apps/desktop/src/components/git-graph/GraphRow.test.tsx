import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitGraphNode } from '@git-manager/git-types'
import type { ResolvedColumn } from './columns.config'
import { GraphRow, GraphAvatarTooltip } from './GraphRow'
import { TagMenuProvider } from './TagMenuContext'
import { useSettingsStore } from '../../stores/settings.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))
vi.mock('./GraphSvg', () => ({ GraphSvg: () => <div data-testid="graph-svg" /> }))

const { lastRefLabelGroupProps } = vi.hoisted(() => ({
  lastRefLabelGroupProps: { current: null as Record<string, unknown> | null },
}))
vi.mock('./RefLabelGroup', () => ({
  RefLabelGroup: (props: Record<string, unknown>) => {
    lastRefLabelGroupProps.current = props
    // Mirror the real badge's `data-ref-tag` marker for tag refs so the row's context-menu detection
    // can be exercised (the real RefLabel is otherwise not rendered here).
    const refs = (props.refs as { type: string; shortName: string }[]) ?? []
    return (
      <div data-testid="ref-label-group">
        {refs
          .filter((r) => r.type === 'tag')
          .map((r) => (
            <span
              key={r.shortName}
              data-ref-tag={r.shortName}
              data-testid={`tag-badge-${r.shortName}`}
            >
              {r.shortName}
            </span>
          ))}
      </div>
    )
  },
}))

const { useGitStashes } = vi.hoisted(() => ({ useGitStashes: vi.fn() }))
vi.mock('../../hooks/useGitStashes', () => ({ useGitStashes }))

const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_REPO_UI = useRepoUIStore.getState()

function col(key: ResolvedColumn['key'], overrides: Partial<ResolvedColumn> = {}): ResolvedColumn {
  const widths: Record<string, number> = {
    refs: 160,
    graph: 120,
    message: 400,
    author: 150,
    date: 110,
    sha: 100,
  }
  return {
    key,
    labelKey: `gitTree.columns.${key}`,
    defaultWidth: widths[key],
    minWidth: 100,
    defaultVisible: true,
    width: widths[key],
    flex: key === 'message',
    ...overrides,
  }
}

function node(overrides: Partial<GitGraphNode> = {}): GitGraphNode {
  return {
    commit: {
      oid: 'abc1234567890',
      shortOid: 'abc1234',
      message: 'Subject\n\nBody text',
      subject: 'Subject line',
      body: '',
      author: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        timestamp: Math.floor(Date.now() / 1000) - 3600,
      },
      committer: { name: 'Ada Lovelace', email: 'ada@example.com', timestamp: 0 },
      parentOids: [],
    },
    column: 0,
    color: '#2563eb',
    connections: [],
    refs: [],
    ...overrides,
  }
}

function renderRow(
  props: Partial<React.ComponentProps<typeof GraphRow>> & { columns: ResolvedColumn[] }
) {
  return render(
    <GraphRow
      node={node()}
      isSelected={false}
      isPrimary={false}
      onSelect={vi.fn()}
      onContextMenu={vi.fn()}
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  lastRefLabelGroupProps.current = null
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  useGitStashes.mockReturnValue({ data: [] })
})

describe('GraphRow — row interaction', () => {
  it('fires onSelect on click and onContextMenu on right-click', () => {
    const onSelect = vi.fn()
    const onContextMenu = vi.fn()
    const { container } = renderRow({ columns: [col('message')], onSelect, onContextMenu })
    const row = container.firstElementChild!
    fireEvent.click(row)
    fireEvent.contextMenu(row)
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onContextMenu).toHaveBeenCalledOnce()
  })
})

describe('GraphRow — tag badge right-click routing', () => {
  const tagRef = {
    name: 'refs/tags/v1.0.0',
    shortName: 'v1.0.0',
    type: 'tag' as const,
    commitOid: 'abc1234567890',
  }

  it('routes a right-click on a tag badge to the tag menu, not the commit menu', () => {
    const onContextMenu = vi.fn()
    const onTagMenu = vi.fn()
    render(
      <TagMenuProvider handler={onTagMenu}>
        <GraphRow
          node={node({ refs: [tagRef] })}
          columns={[col('refs')]}
          isSelected={false}
          isPrimary={false}
          onSelect={vi.fn()}
          onContextMenu={onContextMenu}
        />
      </TagMenuProvider>
    )
    fireEvent.contextMenu(screen.getByTestId('tag-badge-v1.0.0'))
    expect(onTagMenu).toHaveBeenCalledOnce()
    expect(onTagMenu.mock.calls[0][1]).toMatchObject({ type: 'tag', shortName: 'v1.0.0' })
    expect(onContextMenu).not.toHaveBeenCalled()
  })

  it('falls back to the commit menu for a right-click elsewhere on the row', () => {
    const onContextMenu = vi.fn()
    const onTagMenu = vi.fn()
    const { container } = render(
      <TagMenuProvider handler={onTagMenu}>
        <GraphRow
          node={node({ refs: [tagRef] })}
          columns={[col('message')]}
          isSelected={false}
          isPrimary={false}
          onSelect={vi.fn()}
          onContextMenu={onContextMenu}
        />
      </TagMenuProvider>
    )
    fireEvent.contextMenu(container.firstElementChild!)
    expect(onContextMenu).toHaveBeenCalledOnce()
    expect(onTagMenu).not.toHaveBeenCalled()
  })
})

describe('GraphRow — refs column', () => {
  it('renders a RefLabelGroup with the node color when refs are present', () => {
    const refs = [
      {
        name: 'refs/heads/main',
        shortName: 'main',
        type: 'branch' as const,
        commitOid: 'abc1234567890',
      },
    ]
    renderRow({ columns: [col('refs')], node: node({ refs, color: '#123456' }) })
    expect(screen.getByTestId('ref-label-group')).toBeInTheDocument()
    expect(lastRefLabelGroupProps.current).toMatchObject({ refs, color: '#123456' })
  })

  it('renders nothing when there are no refs', () => {
    const { container } = renderRow({ columns: [col('refs')], node: node({ refs: [] }) })
    expect(screen.queryByTestId('ref-label-group')).not.toBeInTheDocument()
    // no ref-label-group and no stray content in the refs cell
    expect(container.querySelector('.lucide-archive')).not.toBeInTheDocument()
  })

  it('renders nothing for a stash commit, even with refs on the node', () => {
    const refs = [
      {
        name: 'stash@{0}',
        shortName: 'stash@{0}',
        type: 'stash' as const,
        commitOid: 'abc1234567890',
      },
    ]
    renderRow({ columns: [col('refs')], node: node({ refs }) })
    expect(screen.queryByTestId('ref-label-group')).not.toBeInTheDocument()
  })
})

describe('GraphRow — lane branch hint', () => {
  const laneRef = {
    name: 'refs/heads/feature',
    shortName: 'feature',
    type: 'branch' as const,
    commitOid: 'deadbeef',
  }

  it("shows the lane's branch faintly in the refs cell for a refless commit", () => {
    renderRow({ columns: [col('refs')], node: node({ refs: [] }), laneRef })
    const hint = screen.getByTestId('lane-branch-hint')
    expect(hint).toBeInTheDocument()
    expect(hint).toHaveTextContent('feature')
    // Hidden until the row is hovered.
    expect(hint).toHaveClass('opacity-0', 'group-hover:opacity-40')
  })

  it('does not show the hint when the commit already carries its own refs', () => {
    const refs = [
      { name: 'refs/heads/main', shortName: 'main', type: 'branch' as const, commitOid: 'abc' },
    ]
    renderRow({ columns: [col('refs')], node: node({ refs }), laneRef })
    expect(screen.queryByTestId('lane-branch-hint')).not.toBeInTheDocument()
    expect(screen.getByTestId('ref-label-group')).toBeInTheDocument()
  })

  it('does not show the hint on the synthetic WIP or CONFLICT rows', () => {
    for (const oid of ['WIP', 'CONFLICT']) {
      const { unmount } = renderRow({
        columns: [col('refs')],
        node: node({ refs: [], commit: { ...node().commit, oid } }),
        laneRef,
      })
      expect(screen.queryByTestId('lane-branch-hint')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('shows nothing for a refless commit whose lane has no owning branch', () => {
    renderRow({ columns: [col('refs')], node: node({ refs: [] }), laneRef: undefined })
    expect(screen.queryByTestId('lane-branch-hint')).not.toBeInTheDocument()
  })
})

describe('GraphRow — graph column', () => {
  it('renders the real GraphSvg (mocked) plus an avatar tooltip for a normal commit', () => {
    const { container } = renderRow({ columns: [col('graph')] })
    expect(screen.getByTestId('graph-svg')).toBeInTheDocument()
    expect(container.querySelector('.pointer-events-auto')).toBeInTheDocument() // GraphAvatarTooltip's hover target
  })

  it('shows a dashed placeholder without a warning icon for the WIP row', () => {
    const { container } = renderRow({
      columns: [col('graph')],
      node: node({ commit: { ...node().commit, oid: 'WIP' } }),
    })
    expect(container.querySelector('.lucide-triangle-alert')).not.toBeInTheDocument()
    expect(container.querySelector('.border-dashed')).toBeTruthy()
  })

  it('shows a warning icon for the CONFLICT row', () => {
    const { container } = renderRow({
      columns: [col('graph')],
      node: node({ commit: { ...node().commit, oid: 'CONFLICT' } }),
    })
    expect(container.querySelector('.lucide-triangle-alert')).toBeTruthy()
  })
})

describe('GraphRow — message column: WIP', () => {
  it('shows the branch tag on the primary WIP row when wipRef is provided', () => {
    const { container } = renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'WIP' } }),
      wipRef: { name: 'main', isWorktree: false },
    })
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(container.querySelector('.lucide-git-branch')).toBeTruthy()
  })

  it('renders the draft message and updates the store on change', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const user = userEvent.setup()
    renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'WIP' } }),
      wipStats: { added: 1, modified: 2, deleted: 0 },
    })
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('~2')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('// WIP'), 'my wip message')
    expect(useRepoDataStore.getState().wipMessages['/repo']).toBe('my wip message')
  })

  it('commits a non-blank trimmed message on Enter', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ wipMessages: { '/repo': '  do the thing  ' } })
    const onCommitWip = vi.fn()
    const user = userEvent.setup()
    renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'WIP' } }),
      onCommitWip,
    })
    await user.type(screen.getByPlaceholderText('// WIP'), '{Enter}')
    expect(onCommitWip).toHaveBeenCalledWith('  do the thing  ')
  })

  it('does not commit on Enter when the message is blank', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const onCommitWip = vi.fn()
    const user = userEvent.setup()
    renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'WIP' } }),
      onCommitWip,
    })
    await user.type(screen.getByPlaceholderText('// WIP'), '{Enter}')
    expect(onCommitWip).not.toHaveBeenCalled()
  })

  it('does not bubble a click on the WIP input up to the row (onSelect)', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'WIP' } }),
      onSelect,
    })
    await user.click(screen.getByPlaceholderText('// WIP'))
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('GraphRow — message column: worktree WIP (WIP:<path>)', () => {
  it('shows the // WIP marker, the worktree branch tag and file count, and hides the Open Worktree button when not selected', () => {
    renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'WIP:/repo-worktree' } }),
      worktreeWipStatuses: [
        {
          path: '/repo-worktree',
          branch: 'feature-x',
          totalChanges: 4,
          added: 1,
          modified: 2,
          deleted: 1,
        },
      ],
      isSelected: false,
      isPrimary: false,
    })
    expect(screen.getByText(/\/\/ WIP/)).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('~2')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
    // The worktree's branch is now surfaced as a tag (worktree icon + name).
    expect(screen.getByText('feature-x')).toBeInTheDocument()
    expect(screen.getByText('feature-x').closest('[title]')).toHaveAttribute('title', 'feature-x')
    expect(
      screen.queryByRole('button', { name: 'gitTree.wip.openWorktree' })
    ).not.toBeInTheDocument()
  })

  it('shows the Open Worktree button once the row is selected, and calls onOpenWorktree with the worktree path', async () => {
    const onOpenWorktree = vi.fn()
    const user = userEvent.setup()
    renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'WIP:/repo-worktree' } }),
      worktreeWipStatuses: [
        {
          path: '/repo-worktree',
          branch: 'feature-x',
          totalChanges: 4,
          added: 1,
          modified: 2,
          deleted: 1,
        },
      ],
      onOpenWorktree,
      isSelected: true,
    })
    // The i18n mock echoes back the raw key for calls without interpolation opts.
    await user.click(screen.getByRole('button', { name: 'gitTree.wip.openWorktree' }))
    expect(onOpenWorktree).toHaveBeenCalledWith('/repo-worktree')
  })

  it('also shows the Open Worktree button when the row is primary (not just isSelected)', () => {
    renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'WIP:/repo-worktree' } }),
      worktreeWipStatuses: [
        {
          path: '/repo-worktree',
          branch: 'feature-x',
          totalChanges: 4,
          added: 1,
          modified: 2,
          deleted: 1,
        },
      ],
      isPrimary: true,
    })
    expect(screen.getByRole('button', { name: 'gitTree.wip.openWorktree' })).toBeInTheDocument()
  })

  it('renders a worktree WIP row with no branch tag when its status is missing', () => {
    const { container } = renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'WIP:/gone' } }),
      worktreeWipStatuses: [], // no matching status for this path
    })
    expect(screen.getByText(/\/\/ WIP/)).toBeInTheDocument()
    expect(container.querySelector('.lucide-folder-git2')).toBeNull() // no worktree branch tag
  })

  it('does not render an editable WIP input for a worktree WIP row', () => {
    renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'WIP:/repo-worktree' } }),
      worktreeWipStatuses: [
        {
          path: '/repo-worktree',
          branch: 'feature-x',
          totalChanges: 4,
          added: 1,
          modified: 2,
          deleted: 1,
        },
      ],
    })
    expect(screen.queryByPlaceholderText('// WIP')).not.toBeInTheDocument()
  })

  it('does not bubble a click on the Open Worktree button up to the row (onSelect)', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'WIP:/repo-worktree' } }),
      worktreeWipStatuses: [
        {
          path: '/repo-worktree',
          branch: 'feature-x',
          totalChanges: 4,
          added: 1,
          modified: 2,
          deleted: 1,
        },
      ],
      onSelect,
      isSelected: true,
    })
    // The i18n mock echoes back the raw key for calls without interpolation opts.
    await user.click(screen.getByRole('button', { name: 'gitTree.wip.openWorktree' }))
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('GraphRow — message column: CONFLICT', () => {
  it('shows the conflict banner with the count/branch from conflictInfo', () => {
    renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'CONFLICT' } }),
      conflictInfo: { count: 2, branchName: 'feature-x' },
    })
    expect(
      screen.getByText('gitTree.contextMenu.conflictBannerMessage:{"count":2,"branch":"feature-x"}')
    ).toBeInTheDocument()
  })
})

describe('GraphRow — message column: normal commit', () => {
  it('shows the subject and a whitespace-collapsed body', () => {
    renderRow({
      columns: [col('message')],
      node: node({
        commit: { ...node().commit, subject: 'Add feature', body: 'line one\n  line two' },
      }),
    })
    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.getByText('line one line two')).toBeInTheDocument()
  })

  it('highlights a leading "fixup!" prefix', () => {
    const { container } = renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, subject: 'fixup! Add feature' } }),
    })
    const fixupSpan = container.querySelector('.text-orange-400')!
    expect(fixupSpan).toHaveTextContent('fixup!')
    expect(screen.getByText(/Add feature/)).toBeInTheDocument()
  })

  it('shows the stash message instead of the commit subject for a matched stash', () => {
    useGitStashes.mockReturnValue({
      data: [
        {
          index: 0,
          message: 'WIP on main: stash subject',
          branch: 'main',
          commitOid: 'abc1234567890',
          timestamp: 0,
          filesCount: 1,
          additions: 0,
          deletions: 0,
        },
      ],
    })
    const refs = [
      {
        name: 'stash@{0}',
        shortName: 'stash@{0}',
        type: 'stash' as const,
        commitOid: 'abc1234567890',
      },
    ]
    renderRow({
      columns: [col('message')],
      node: node({ refs, commit: { ...node().commit, subject: 'fallback subject' } }),
    })
    expect(screen.getByText('WIP on main: stash subject')).toBeInTheDocument()
    expect(screen.queryByText('fallback subject')).not.toBeInTheDocument()
  })
})

describe('GraphRow — dimmed (search non-match)', () => {
  it('renders subject/author/sha in normal styling when not dimmed', () => {
    renderRow({
      columns: [col('message'), col('author'), col('sha')],
      node: node({ commit: { ...node().commit, subject: 'Add feature' } }),
    })
    expect(screen.getByText('Add feature')).toHaveClass('text-foreground')
    expect(screen.getByText('Add feature').parentElement).not.toHaveClass('italic')
    expect(screen.getByText('Ada Lovelace')).not.toHaveClass('italic')
    expect(screen.getByText('abc1234')).not.toHaveClass('italic')
  })

  it('mutes and italicizes the subject/author/sha text when dimmed', () => {
    renderRow({
      columns: [col('message'), col('author'), col('sha')],
      node: node({ commit: { ...node().commit, subject: 'Add feature' } }),
      dimmed: true,
    })
    expect(screen.getByText('Add feature')).toHaveClass('text-muted-foreground/40')
    expect(screen.getByText('Add feature').parentElement).toHaveClass('italic')
    expect(screen.getByText('Ada Lovelace')).toHaveClass('italic', 'text-muted-foreground/40')
    expect(screen.getByText('abc1234')).toHaveClass('italic', 'text-muted-foreground/40')
  })

  it('still renders the row (does not hide it) when dimmed', () => {
    renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, subject: 'Add feature' } }),
      dimmed: true,
    })
    expect(screen.getByText('Add feature')).toBeInTheDocument()
  })
})

describe('GraphRow — author/date/sha columns', () => {
  it('shows author initials and name for a normal commit', () => {
    renderRow({
      columns: [col('author')],
      node: node({
        commit: { ...node().commit, author: { name: 'Ada Lovelace', email: '', timestamp: 0 } },
      }),
    })
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('hides author/date/sha for WIP and CONFLICT rows', () => {
    for (const oid of ['WIP', 'CONFLICT']) {
      const { container, unmount } = renderRow({
        columns: [col('author'), col('date'), col('sha')],
        node: node({ commit: { ...node().commit, oid } }),
      })
      expect(container.textContent).toBe('')
      unmount()
    }
  })

  it('shows a relative date with the exact date as the title', () => {
    const timestamp = Math.floor(Date.now() / 1000) - 7200 // 2h ago
    renderRow({
      columns: [col('date')],
      node: node({ commit: { ...node().commit, author: { name: 'A', email: '', timestamp } } }),
    })
    expect(screen.getByText('2h ago')).toBeInTheDocument()
  })

  it('shows the short oid with the full oid as the title', () => {
    renderRow({
      columns: [col('sha')],
      node: node({ commit: { ...node().commit, oid: 'fullsha1234567890', shortOid: 'fullsha' } }),
    })
    const code = screen.getByText('fullsha')
    expect(code).toHaveAttribute('title', 'fullsha1234567890')
  })
})

describe('GraphRow — selection/conflict styling', () => {
  it('applies the primary selection tint when isPrimary', () => {
    const { container } = renderRow({ columns: [col('message')], isPrimary: true })
    expect(container.querySelector('.bg-primary\\/20')).toBeTruthy()
  })

  it('applies the softer selection tint when isSelected but not primary', () => {
    const { container } = renderRow({
      columns: [col('message')],
      isSelected: true,
      isPrimary: false,
    })
    expect(container.querySelector('.bg-primary\\/10')).toBeTruthy()
  })

  it('adds the CONFLICT-specific background layer only for the CONFLICT row', () => {
    // jsdom normalizes inline hex colors to rgb() when serialized: #904538 -> rgb(144, 69, 56)
    const { container: normalRow } = renderRow({ columns: [col('message')] })
    expect(normalRow.querySelector('[style*="144, 69, 56"]')).toBeFalsy()

    const { container: conflictRow } = renderRow({
      columns: [col('message')],
      node: node({ commit: { ...node().commit, oid: 'CONFLICT' } }),
    })
    expect(conflictRow.querySelector('[style*="144, 69, 56"]')).toBeTruthy()
  })
})

describe('GraphRow — graph column width modes', () => {
  // Standard 32px avatar: at maxColumn 6 the graph needs ~171px, so width 120 is `overflow`
  // and 48 is `compact` (see graphColumnSizing).
  it('keeps the band tint and renders lines in full width', () => {
    const { container } = renderRow({
      columns: [col('graph', { width: 200 })],
      node: node({ column: 1 }),
      graphMaxColumn: 3,
    })
    const band = container.querySelector('[class*="border-r-"]') as HTMLElement
    expect(band.style.backgroundColor).not.toBe('transparent')
    expect(screen.getByTestId('graph-svg')).toBeInTheDocument()
  })

  it('drops the band tint for an overflowed node in overflow mode', () => {
    const { container } = renderRow({
      columns: [col('graph', { width: 120 })],
      node: node({ column: 5 }),
      graphMaxColumn: 6,
    })
    const band = container.querySelector('[class*="border-r-"]') as HTMLElement
    expect(band.style.backgroundColor).toBe('transparent')
  })

  it('keeps the band tint of a non-overflowed node in overflow mode', () => {
    const { container } = renderRow({
      columns: [col('graph', { width: 120 })],
      node: node({ column: 0 }),
      graphMaxColumn: 6,
    })
    const band = container.querySelector('[class*="border-r-"]') as HTMLElement
    expect(band.style.backgroundColor).not.toBe('transparent')
  })

  it('hides the connection lines entirely at the compact minimum width', () => {
    renderRow({
      columns: [col('graph', { width: 48 })],
      node: node({ column: 3 }),
      graphMaxColumn: 6,
    })
    expect(screen.queryByTestId('graph-svg')).not.toBeInTheDocument()
  })

  it('applies a more vivid band tint when the row is selected, even for an overflowed node', () => {
    const bandColor = (props: Parameters<typeof renderRow>[0]) => {
      const { container, unmount } = renderRow(props)
      const c = (container.querySelector('[class*="border-r-"]') as HTMLElement).style
        .backgroundColor
      unmount()
      return c
    }
    const normal = bandColor({
      columns: [col('graph', { width: 200 })],
      node: node({ column: 1, color: '#2563eb' }),
      graphMaxColumn: 3,
    })
    const selected = bandColor({
      columns: [col('graph', { width: 200 })],
      node: node({ column: 1, color: '#2563eb' }),
      graphMaxColumn: 3,
      isPrimary: true,
    })
    expect(normal).toBeTruthy()
    expect(selected).not.toBe(normal)
    // An overflowed node normally has no tint, but keeps the vivid one once selected.
    const overflowedSelected = bandColor({
      columns: [col('graph', { width: 120 })],
      node: node({ column: 5, color: '#2563eb' }),
      graphMaxColumn: 6,
      isSelected: true,
    })
    expect(overflowedSelected).toBe(selected)
  })
})

describe('GraphRow — author avatar image fallback', () => {
  it('falls back to initials when the author avatar image fails to load', () => {
    const { container } = renderRow({
      columns: [col('author')],
      node: node({
        commit: {
          ...node().commit,
          author: { name: 'Ada Lovelace', email: 'ada@example.com', timestamp: 0 },
        },
      }),
    })
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    fireEvent.error(img!)
    expect(screen.getByText('AL')).toBeInTheDocument()
  })
})

describe('GraphAvatarTooltip', () => {
  it('shows a name/email tooltip on hover and hides it on mouse leave', () => {
    // No email -> getAvatarUrl() returns null -> falls back to initials, which we can target
    const noEmailNode = node({
      commit: { ...node().commit, author: { name: 'Ada Lovelace', email: '', timestamp: 0 } },
    })
    render(<GraphAvatarTooltip node={noEmailNode} />)
    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByText('AL'))
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()

    fireEvent.mouseLeave(screen.getByText('AL'))
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
  })

  it('shows a dashed archive icon instead of initials for a stash node', () => {
    const stashNode = node({
      refs: [
        { name: 'stash@{0}', shortName: 'stash@{0}', type: 'stash', commitOid: 'abc1234567890' },
      ],
    })
    const { container } = render(<GraphAvatarTooltip node={stashNode} />)
    expect(container.querySelector('.lucide-archive')).toBeTruthy()
    expect(screen.queryByText('AL')).not.toBeInTheDocument()
  })

  it('shows a flat color-filled circle instead of an avatar for a merge commit', () => {
    const mergeNode = node({
      color: '#16a34a',
      commit: { ...node().commit, parentOids: ['parent1', 'parent2'] },
    })
    const { container } = render(<GraphAvatarTooltip node={mergeNode} />)
    expect(screen.queryByText('AL')).not.toBeInTheDocument()
    const circle = container.querySelector('.pointer-events-auto > div') as HTMLElement
    expect(circle.style.backgroundColor).toBe('rgb(22, 163, 74)')
  })

  it('does not treat a normal commit (0-1 parents) as a merge', () => {
    // No email -> getAvatarUrl() returns null -> falls back to initials, same as the hover test above
    const normalNode = node({
      commit: {
        ...node().commit,
        parentOids: ['parent1'],
        author: { name: 'Ada Lovelace', email: '', timestamp: 0 },
      },
    })
    render(<GraphAvatarTooltip node={normalNode} />)
    expect(screen.getByText('AL')).toBeInTheDocument()
  })
})

describe('GraphRow — remaining branch coverage', () => {
  it('mutes the body, date, and fixup prefix when dimmed', () => {
    renderRow({
      columns: [col('message'), col('date')],
      node: node({
        commit: {
          ...node().commit,
          subject: 'fixup! Add feature',
          body: 'some body',
          author: { name: 'A', email: '', timestamp: Math.floor(Date.now() / 1000) - 7200 },
        },
      }),
      dimmed: true,
    })
    expect(screen.getByText('some body')).toHaveClass('text-muted-foreground/40')
    expect(screen.getByText('2h ago')).toHaveClass('italic', 'text-muted-foreground/40')
    // The "fixup!" prefix loses its orange highlight when the row is dimmed.
    expect(screen.getByText('fixup!')).not.toHaveClass('text-orange-400')
  })

  it('renders the ref connector fully opaque when the row carries the local main branch', () => {
    const refs = [
      {
        name: 'refs/heads/main',
        shortName: 'main',
        type: 'branch' as const,
        commitOid: 'abc1234567890',
      },
    ]
    const { container } = renderRow({
      columns: [col('refs')],
      node: node({ refs, color: '#123456' }),
    })
    const connector = container.querySelector('.ml-2.flex-1') as HTMLElement
    // jsdom serializes the opaque hex to rgb(); the non-main path would append a '40' alpha.
    expect(connector.style.backgroundColor).toBe('rgb(18, 52, 86)')
  })

  it('renders the ref connector faint for origin/main, like any other ref', () => {
    const refs = [
      {
        name: 'refs/remotes/origin/main',
        shortName: 'origin/main',
        type: 'remote' as const,
        commitOid: 'abc1234567890',
      },
    ]
    const { container } = renderRow({
      columns: [col('refs')],
      node: node({ refs, color: '#123456' }),
    })
    const connector = container.querySelector('.ml-2.flex-1') as HTMLElement
    // The '40' alpha is appended → jsdom serializes it as an rgba() with ~0.25 opacity.
    expect(connector.style.backgroundColor).toBe('rgba(18, 52, 86, 0.25)')
  })

  it('shows a dashed archive mini-avatar in the author column for a stash commit', () => {
    const refs = [
      {
        name: 'stash@{0}',
        shortName: 'stash@{0}',
        type: 'stash' as const,
        commitOid: 'abc1234567890',
      },
    ]
    const { container } = renderRow({ columns: [col('author')], node: node({ refs }) })
    expect(container.querySelector('.lucide-archive')).toBeTruthy()
  })

  it('uses the shorter row and 24px avatar for the small row height setting', () => {
    useSettingsStore.setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        appearance: { ...s.settings.appearance, rowHeight: 'small' as const },
      },
    }))
    const { container } = renderRow({ columns: [col('graph')] })
    expect(container.querySelector('.h-\\[24px\\]')).toBeTruthy()
  })

  it('falls back to the standard row height when the setting is absent', () => {
    useSettingsStore.setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        appearance: { ...s.settings.appearance, rowHeight: undefined },
      },
    }))
    const { container } = renderRow({ columns: [col('graph')] })
    expect(container.querySelector('.h-\\[32px\\]')).toBeTruthy()
  })
})

describe('GraphRow — background band alignment', () => {
  function bandLeft(columns: ResolvedColumn[]): number {
    const { container, unmount } = renderRow({ columns })
    const band = container.querySelector('[data-testid="graph-row-band"]') as HTMLElement
    const left = parseFloat(band.style.left)
    unmount()
    return left
  }

  it('starts the band at x=0 offset when the refs column is hidden (not a hard-coded fallback)', () => {
    // The graph column becomes the first column when refs is hidden, so the colored band must shift
    // left by exactly the refs column width (160) instead of staying pinned to the old 160 fallback.
    const withRefs = bandLeft([col('refs'), col('graph'), col('message')])
    const withoutRefs = bandLeft([col('graph'), col('message')])
    expect(withRefs - withoutRefs).toBe(160)
  })
})
