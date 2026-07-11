import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitGraphNode } from '@git-manager/git-types'
import type { ResolvedColumn } from './columns'
import { GraphRow, GraphAvatarTooltip } from './GraphRow'
import { useSettingsStore } from '../../stores/settings.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}))
vi.mock('./GraphSvg', () => ({ GraphSvg: () => <div data-testid="graph-svg" /> }))

const { lastRefLabelGroupProps } = vi.hoisted(() => ({ lastRefLabelGroupProps: { current: null as Record<string, unknown> | null } }))
vi.mock('./RefLabelGroup', () => ({
  RefLabelGroup: (props: Record<string, unknown>) => {
    lastRefLabelGroupProps.current = props
    return <div data-testid="ref-label-group" />
  },
}))

const { useGitStashes } = vi.hoisted(() => ({ useGitStashes: vi.fn() }))
vi.mock('../../hooks/useGitStashes', () => ({ useGitStashes }))

const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_REPO_UI = useRepoUIStore.getState()

function col(key: ResolvedColumn['key'], overrides: Partial<ResolvedColumn> = {}): ResolvedColumn {
  const widths: Record<string, number> = { refs: 160, graph: 120, message: 400, author: 150, date: 110, sha: 100 }
  return { key, labelKey: `gitTree.columns.${key}`, defaultWidth: widths[key], minWidth: 100, defaultVisible: true, width: widths[key], flex: key === 'message', ...overrides }
}

function node(overrides: Partial<GitGraphNode> = {}): GitGraphNode {
  return {
    commit: {
      oid: 'abc1234567890',
      shortOid: 'abc1234',
      message: 'Subject\n\nBody text',
      subject: 'Subject line',
      body: '',
      author: { name: 'Ada Lovelace', email: 'ada@example.com', timestamp: Math.floor(Date.now() / 1000) - 3600 },
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

function renderRow(props: Partial<React.ComponentProps<typeof GraphRow>> & { columns: ResolvedColumn[] }) {
  return render(
    <GraphRow
      node={node()}
      isSelected={false}
      isPrimary={false}
      onSelect={vi.fn()}
      onContextMenu={vi.fn()}
      onOpenMenu={vi.fn()}
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

  it('fires onOpenMenu from the actions (⋮) button', async () => {
    const onOpenMenu = vi.fn()
    const user = userEvent.setup()
    renderRow({ columns: [col('message')], onOpenMenu })
    await user.click(screen.getByTitle('Actions'))
    expect(onOpenMenu).toHaveBeenCalledOnce()
  })
})

describe('GraphRow — refs column', () => {
  it('renders a RefLabelGroup with the node color when refs are present', () => {
    const refs = [{ name: 'refs/heads/main', shortName: 'main', type: 'branch' as const, commitOid: 'abc1234567890' }]
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
    const refs = [{ name: 'stash@{0}', shortName: 'stash@{0}', type: 'stash' as const, commitOid: 'abc1234567890' }]
    renderRow({ columns: [col('refs')], node: node({ refs }) })
    expect(screen.queryByTestId('ref-label-group')).not.toBeInTheDocument()
  })
})

describe('GraphRow — graph column', () => {
  it('renders the real GraphSvg (mocked) plus an avatar tooltip for a normal commit', () => {
    const { container } = renderRow({ columns: [col('graph')] })
    expect(screen.getByTestId('graph-svg')).toBeInTheDocument()
    expect(container.querySelector('.pointer-events-auto')).toBeInTheDocument() // GraphAvatarTooltip's hover target
  })

  it('shows a dashed placeholder without a warning icon for the WIP row', () => {
    const { container } = renderRow({ columns: [col('graph')], node: node({ commit: { ...node().commit, oid: 'WIP' } }) })
    expect(container.querySelector('.lucide-triangle-alert')).not.toBeInTheDocument()
    expect(container.querySelector('.border-dashed')).toBeTruthy()
  })

  it('shows a warning icon for the CONFLICT row', () => {
    const { container } = renderRow({ columns: [col('graph')], node: node({ commit: { ...node().commit, oid: 'CONFLICT' } }) })
    expect(container.querySelector('.lucide-triangle-alert')).toBeTruthy()
  })
})

describe('GraphRow — message column: WIP', () => {
  it('binds the WIP input to the per-repo wip message and shows the total-changes count', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const user = userEvent.setup()
    renderRow({ columns: [col('message')], node: node({ commit: { ...node().commit, oid: 'WIP' } }), totalChanges: 3 })
    expect(screen.getByText('3')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('// WIP'), 'my wip message')
    expect(useRepoDataStore.getState().wipMessages['/repo']).toBe('my wip message')
  })

  it('commits a non-blank trimmed message on Enter', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ wipMessages: { '/repo': '  do the thing  ' } })
    const onCommitWip = vi.fn()
    const user = userEvent.setup()
    renderRow({ columns: [col('message')], node: node({ commit: { ...node().commit, oid: 'WIP' } }), onCommitWip })
    await user.type(screen.getByPlaceholderText('// WIP'), '{Enter}')
    expect(onCommitWip).toHaveBeenCalledWith('  do the thing  ')
  })

  it('does not commit on Enter when the message is blank', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const onCommitWip = vi.fn()
    const user = userEvent.setup()
    renderRow({ columns: [col('message')], node: node({ commit: { ...node().commit, oid: 'WIP' } }), onCommitWip })
    await user.type(screen.getByPlaceholderText('// WIP'), '{Enter}')
    expect(onCommitWip).not.toHaveBeenCalled()
  })

  it('does not bubble a click on the WIP input up to the row (onSelect)', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderRow({ columns: [col('message')], node: node({ commit: { ...node().commit, oid: 'WIP' } }), onSelect })
    await user.click(screen.getByPlaceholderText('// WIP'))
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
    expect(screen.getByText('gitTree.contextMenu.conflictBannerMessage:{"count":2,"branch":"feature-x"}')).toBeInTheDocument()
  })
})

describe('GraphRow — message column: normal commit', () => {
  it('shows the subject and a whitespace-collapsed body', () => {
    renderRow({ columns: [col('message')], node: node({ commit: { ...node().commit, subject: 'Add feature', body: 'line one\n  line two' } }) })
    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.getByText('line one line two')).toBeInTheDocument()
  })

  it('highlights a leading "fixup!" prefix', () => {
    const { container } = renderRow({ columns: [col('message')], node: node({ commit: { ...node().commit, subject: 'fixup! Add feature' } }) })
    const fixupSpan = container.querySelector('.text-orange-400')!
    expect(fixupSpan).toHaveTextContent('fixup!')
    expect(screen.getByText(/Add feature/)).toBeInTheDocument()
  })

  it('shows the stash message instead of the commit subject for a matched stash', () => {
    useGitStashes.mockReturnValue({ data: [{ index: 0, message: 'WIP on main: stash subject', branch: 'main', commitOid: 'abc1234567890', timestamp: 0, filesCount: 1, additions: 0, deletions: 0 }] })
    const refs = [{ name: 'stash@{0}', shortName: 'stash@{0}', type: 'stash' as const, commitOid: 'abc1234567890' }]
    renderRow({ columns: [col('message')], node: node({ refs, commit: { ...node().commit, subject: 'fallback subject' } }) })
    expect(screen.getByText('WIP on main: stash subject')).toBeInTheDocument()
    expect(screen.queryByText('fallback subject')).not.toBeInTheDocument()
  })
})

describe('GraphRow — author/date/sha columns', () => {
  it('shows author initials and name for a normal commit', () => {
    renderRow({ columns: [col('author')], node: node({ commit: { ...node().commit, author: { name: 'Ada Lovelace', email: '', timestamp: 0 } } }) })
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
    renderRow({ columns: [col('date')], node: node({ commit: { ...node().commit, author: { name: 'A', email: '', timestamp } } }) })
    expect(screen.getByText('2h ago')).toBeInTheDocument()
  })

  it('shows the short oid with the full oid as the title', () => {
    renderRow({ columns: [col('sha')], node: node({ commit: { ...node().commit, oid: 'fullsha1234567890', shortOid: 'fullsha' } }) })
    const code = screen.getByText('fullsha')
    expect(code).toHaveAttribute('title', 'fullsha1234567890')
  })
})

describe('GraphRow — selection/conflict styling', () => {
  it('applies the primary accent background when isPrimary', () => {
    const { container } = renderRow({ columns: [col('message')], isPrimary: true })
    expect(container.querySelector('.bg-accent')).toBeTruthy()
  })

  it('applies the softer selected background when isSelected but not primary', () => {
    const { container } = renderRow({ columns: [col('message')], isSelected: true, isPrimary: false })
    expect(container.querySelector('.bg-accent\\/70')).toBeTruthy()
  })

  it('adds the CONFLICT-specific background layer only for the CONFLICT row', () => {
    // jsdom normalizes inline hex colors to rgb() when serialized: #904538 -> rgb(144, 69, 56)
    const { container: normalRow } = renderRow({ columns: [col('message')] })
    expect(normalRow.querySelector('[style*="144, 69, 56"]')).toBeFalsy()

    const { container: conflictRow } = renderRow({ columns: [col('message')], node: node({ commit: { ...node().commit, oid: 'CONFLICT' } }) })
    expect(conflictRow.querySelector('[style*="144, 69, 56"]')).toBeTruthy()
  })
})

describe('GraphAvatarTooltip', () => {
  it('shows a name/email tooltip on hover and hides it on mouse leave', () => {
    // No email -> getAvatarUrl() returns null -> falls back to initials, which we can target
    const noEmailNode = node({ commit: { ...node().commit, author: { name: 'Ada Lovelace', email: '', timestamp: 0 } } })
    render(<GraphAvatarTooltip node={noEmailNode} />)
    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByText('AL'))
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()

    fireEvent.mouseLeave(screen.getByText('AL'))
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
  })

  it('shows a dashed archive icon instead of initials for a stash node', () => {
    const stashNode = node({ refs: [{ name: 'stash@{0}', shortName: 'stash@{0}', type: 'stash', commitOid: 'abc1234567890' }] })
    const { container } = render(<GraphAvatarTooltip node={stashNode} />)
    expect(container.querySelector('.lucide-archive')).toBeTruthy()
    expect(screen.queryByText('AL')).not.toBeInTheDocument()
  })
})
