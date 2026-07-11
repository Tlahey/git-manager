import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitGraphNode } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { useGitLog, useGitStatus, useCommitSelection, useGitGraphNodes, useGitGraphActions, apiGetRebaseState } = vi.hoisted(() => ({
  useGitLog: vi.fn(),
  useGitStatus: vi.fn(),
  useCommitSelection: vi.fn(),
  useGitGraphNodes: vi.fn(),
  useGitGraphActions: vi.fn(),
  apiGetRebaseState: vi.fn(),
}))
vi.mock('../../hooks/useGitLog', () => ({ useGitLog }))
vi.mock('../../hooks/useGitStatus', () => ({ useGitStatus }))
vi.mock('../../hooks/useCommitSelection', () => ({ useCommitSelection }))
vi.mock('../../hooks/useGitGraphNodes', () => ({ useGitGraphNodes }))
vi.mock('../../hooks/useGitGraphActions', () => ({ useGitGraphActions }))
vi.mock('../../api/git.api', () => ({ apiGetRebaseState }))

const { virtualizerScrollToIndex } = vi.hoisted(() => ({ virtualizerScrollToIndex: vi.fn() }))
// jsdom reports a 0-height scroll container, so the real @tanstack/react-virtual would only
// produce virtual items that fit a 0px viewport (i.e. none) — mock it to always render every
// item so GitGraph's own row-wiring logic (not react-virtual's windowing) is what's under test.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => opts.count * opts.estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, index) => ({ key: index, index, start: index * opts.estimateSize() })),
    scrollToIndex: virtualizerScrollToIndex,
  }),
}))

const { webviewGetByLabel, WebviewWindowCtor } = vi.hoisted(() => ({
  webviewGetByLabel: vi.fn(),
  WebviewWindowCtor: vi.fn(),
}))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: Object.assign(
    function (this: unknown, ...args: unknown[]) {
      WebviewWindowCtor(...args)
    },
    { getByLabel: (...a: unknown[]) => webviewGetByLabel(...a) }
  ),
}))

const {
  lastGraphRowCalls,
  lastGraphHeaderProps,
  lastCommitDetailsProps,
  lastDiffViewCenterProps,
  lastOverlayManagerProps,
  lastConflictPanelProps,
  lastWaterlineLabels,
} = vi.hoisted(() => ({
  lastGraphRowCalls: { current: [] as Record<string, unknown>[] },
  lastGraphHeaderProps: { current: null as Record<string, unknown> | null },
  lastCommitDetailsProps: { current: null as Record<string, unknown> | null },
  lastDiffViewCenterProps: { current: null as Record<string, unknown> | null },
  lastOverlayManagerProps: { current: null as Record<string, unknown> | null },
  lastConflictPanelProps: { current: null as Record<string, unknown> | null },
  lastWaterlineLabels: { current: [] as string[] },
}))
vi.mock('./GraphRow', () => ({
  GraphRow: (props: Record<string, unknown>) => {
    lastGraphRowCalls.current.push(props)
    return <div data-testid="graph-row" data-oid={(props.node as GitGraphNode).commit.oid} />
  },
}))
vi.mock('./GraphHeader', () => ({
  GraphHeader: (props: Record<string, unknown>) => {
    lastGraphHeaderProps.current = props
    return <div data-testid="graph-header" />
  },
}))
vi.mock('./CommitDetailsPanel', () => ({
  CommitDetailsPanel: (props: Record<string, unknown>) => {
    lastCommitDetailsProps.current = props
    return <div data-testid="commit-details-panel" />
  },
}))
vi.mock('./DiffViewCenter', () => ({
  DiffViewCenter: (props: Record<string, unknown>) => {
    lastDiffViewCenterProps.current = props
    return <div data-testid="diff-view-center" />
  },
}))
vi.mock('./components/GitGraphOverlayManager', () => ({
  GitGraphOverlayManager: (props: Record<string, unknown>) => {
    lastOverlayManagerProps.current = props
    return <div data-testid="overlay-manager" />
  },
}))
vi.mock('./ConflictResolutionPanel', () => ({
  ConflictResolutionPanel: (props: Record<string, unknown>) => {
    lastConflictPanelProps.current = props
    return <div data-testid="conflict-resolution-panel" />
  },
}))
vi.mock('./Waterline', () => ({
  Waterline: (props: { label: string }) => {
    lastWaterlineLabels.current.push(props.label)
    return <div data-testid="waterline">{props.label}</div>
  },
}))

import { GitGraph } from './GitGraph'
import { useSettingsStore } from '../../stores/settings.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'

const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_REPO_UI = useRepoUIStore.getState()
const INITIAL_COLUMNS = useGitGraphColumnsStore.getState()

function commitNode(oid: string, overrides: Partial<GitGraphNode> = {}): GitGraphNode {
  return {
    commit: { oid, shortOid: oid.slice(0, 7), message: 'm', subject: 's', body: '', author: {} as never, committer: {} as never, parentOids: [] },
    column: 0,
    color: '#000',
    connections: [],
    refs: [],
    ...overrides,
  }
}

function selectionState(overrides: Partial<ReturnType<typeof useCommitSelection>> = {}) {
  return {
    selected: new Set<string>(),
    primaryOid: null,
    setPrimaryOid: vi.fn(),
    selectSingle: vi.fn(),
    handleRowSelect: vi.fn(),
    clearSelection: vi.fn(),
    ...overrides,
  }
}

function graphNodesState(nodes: GitGraphNode[], overrides: Partial<ReturnType<typeof useGitGraphNodes>> = {}) {
  return {
    wipNode: null,
    conflictNode: null,
    filteredNodes: nodes,
    renderNodes: nodes,
    waterlines: [],
    originMainIndex: -1,
    ...overrides,
  }
}

function actionsState(overrides: Partial<ReturnType<typeof useGitGraphActions>> = {}) {
  return {
    pendingAction: null,
    setPendingAction: vi.fn(),
    openMenuAt: vi.fn(),
    handleCommitWip: vi.fn(),
    ...overrides,
  }
}

function renderGraph(props: Partial<React.ComponentProps<typeof GitGraph>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <GitGraph repoPath="/repo" {...props} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  lastGraphRowCalls.current = []
  lastGraphHeaderProps.current = null
  lastCommitDetailsProps.current = null
  lastDiffViewCenterProps.current = null
  lastOverlayManagerProps.current = null
  lastConflictPanelProps.current = null
  lastWaterlineLabels.current = []

  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  useGitGraphColumnsStore.setState(INITIAL_COLUMNS, true)

  apiGetRebaseState.mockResolvedValue({ kind: 'none' })
  useGitStatus.mockReturnValue({ data: undefined })
  useGitLog.mockReturnValue({ data: [], isLoading: false, isError: false })
  useCommitSelection.mockReturnValue(selectionState())
  useGitGraphNodes.mockReturnValue(graphNodesState([]))
  useGitGraphActions.mockReturnValue(actionsState())
})

describe('GitGraph — loading/error/empty states', () => {
  it('shows a loading indicator', () => {
    useGitLog.mockReturnValue({ data: [], isLoading: true, isError: false })
    renderGraph()
    expect(screen.getByText('gitTree.loading')).toBeInTheDocument()
  })

  it('shows an error message', () => {
    useGitLog.mockReturnValue({ data: [], isLoading: false, isError: true })
    renderGraph()
    expect(screen.getByText('Failed to load history')).toBeInTheDocument()
  })

  it('shows a "no commits" message when the log is empty', () => {
    renderGraph()
    expect(screen.getByText('gitTree.noCommits')).toBeInTheDocument()
  })

  it('shows a "no results" message when a search filters everything out, but still renders the header', () => {
    const nodes = [commitNode('a')]
    useGitLog.mockReturnValue({ data: nodes, isLoading: false, isError: false })
    useGitGraphNodes.mockReturnValue(graphNodesState([]))
    renderGraph({ searchQuery: 'nomatch' })
    expect(screen.getByTestId('graph-header')).toBeInTheDocument()
    expect(screen.getByText('gitTree.noResults')).toBeInTheDocument()
  })
})

describe('GitGraph — rendering rows', () => {
  it('renders one GraphRow per filtered node, wired with selection/context props', () => {
    const nodes = [commitNode('a'), commitNode('b')]
    useGitLog.mockReturnValue({ data: nodes, isLoading: false, isError: false })
    useGitGraphNodes.mockReturnValue(graphNodesState(nodes))
    useCommitSelection.mockReturnValue(selectionState({ selected: new Set(['a']), primaryOid: 'b' }))
    renderGraph()

    expect(lastGraphRowCalls.current).toHaveLength(2)
    expect(lastGraphRowCalls.current[0]).toMatchObject({ isSelected: true, isPrimary: false, isFirst: true })
    expect(lastGraphRowCalls.current[1]).toMatchObject({ isSelected: false, isPrimary: true, isFirst: false })
  })

  it('forwards column visibility/width derived from the columns store to GraphHeader', () => {
    useGitGraphColumnsStore.setState({
      columns: { ...INITIAL_COLUMNS.columns, sha: { visible: true, width: 123 } },
    })
    useGitLog.mockReturnValue({ data: [commitNode('a')], isLoading: false, isError: false })
    useGitGraphNodes.mockReturnValue(graphNodesState([commitNode('a')]))
    renderGraph()
    const columns = lastGraphHeaderProps.current!.columns as { key: string; width: number }[]
    expect(columns.find((c) => c.key === 'sha')).toMatchObject({ width: 123 })
  })

  it('renders waterline overlays from useGitGraphNodes', () => {
    const nodes = [commitNode('a')]
    useGitLog.mockReturnValue({ data: nodes, isLoading: false, isError: false })
    useGitGraphNodes.mockReturnValue(graphNodesState(nodes, { waterlines: [{ id: 'w1', label: 'Yesterday', index: 0 }] }))
    renderGraph()
    expect(lastWaterlineLabels.current).toEqual(['Yesterday'])
  })

  it('routes row clicks to handleRowSelect with the row index', () => {
    const nodes = [commitNode('a'), commitNode('b')]
    const handleRowSelect = vi.fn()
    useGitLog.mockReturnValue({ data: nodes, isLoading: false, isError: false })
    useGitGraphNodes.mockReturnValue(graphNodesState(nodes))
    useCommitSelection.mockReturnValue(selectionState({ handleRowSelect }))
    renderGraph()

    const onSelect = lastGraphRowCalls.current[1].onSelect as (e: unknown) => void
    onSelect({} as never)
    expect(handleRowSelect).toHaveBeenCalledWith({}, 1)
  })
})

describe('GitGraph — side panel routing', () => {
  it('shows nothing in the side panel when there is no primary selection', () => {
    renderGraph()
    expect(screen.queryByTestId('commit-details-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('conflict-resolution-panel')).not.toBeInTheDocument()
  })

  it('shows CommitDetailsPanel for a normal primary selection', () => {
    const nodes = [commitNode('a')]
    useGitLog.mockReturnValue({ data: nodes, isLoading: false, isError: false })
    useGitGraphNodes.mockReturnValue(graphNodesState(nodes))
    useCommitSelection.mockReturnValue(selectionState({ primaryOid: 'a' }))
    renderGraph()
    expect(screen.getByTestId('commit-details-panel')).toBeInTheDocument()
    expect((lastCommitDetailsProps.current!.node as GitGraphNode).commit.oid).toBe('a')
  })

  it('resolves the WIP sentinel node from useGitGraphNodes', () => {
    const wip = commitNode('WIP')
    useGitGraphNodes.mockReturnValue(graphNodesState([], { wipNode: wip }))
    useCommitSelection.mockReturnValue(selectionState({ primaryOid: 'WIP' }))
    renderGraph()
    expect((lastCommitDetailsProps.current!.node as GitGraphNode).commit.oid).toBe('WIP')
  })

  it('shows the ConflictResolutionPanel instead of CommitDetailsPanel for the CONFLICT sentinel', () => {
    const conflict = commitNode('CONFLICT')
    useGitGraphNodes.mockReturnValue(graphNodesState([], { conflictNode: conflict }))
    useCommitSelection.mockReturnValue(selectionState({ primaryOid: 'CONFLICT' }))
    renderGraph()
    expect(screen.getByTestId('conflict-resolution-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('commit-details-panel')).not.toBeInTheDocument()
  })

  it('closing the conflict panel clears the selection and the conflict file path', async () => {
    const conflict = commitNode('CONFLICT')
    useGitGraphNodes.mockReturnValue(graphNodesState([], { conflictNode: conflict }))
    const clearSelection = vi.fn()
    useCommitSelection.mockReturnValue(selectionState({ primaryOid: 'CONFLICT', clearSelection }))
    useRepoUIStore.setState({ conflictFilePath: 'a.ts' })
    renderGraph()
    ;(lastConflictPanelProps.current!.onClose as () => void)()
    expect(clearSelection).toHaveBeenCalledOnce()
    expect(useRepoUIStore.getState().conflictFilePath).toBeNull()
  })
})

describe('GitGraph — diff view routing', () => {
  it('shows DiffViewCenter instead of the graph when a diff file is active', () => {
    // Set *after* mount: GitGraph resets activeDiffFile to null on mount (it's keyed on
    // primaryOid/repoPath, both of which "change" from their initial undefined on first render),
    // so pre-seeding the store before render would just be clobbered — this mirrors how it
    // really happens in the app (a child panel calls setActiveDiffFile after the graph is up).
    renderGraph()
    act(() => useRepoUIStore.setState({ activeDiffFile: { path: 'a.ts', staged: false } }))
    expect(screen.getByTestId('diff-view-center')).toBeInTheDocument()
    expect(screen.queryByTestId('graph-header')).not.toBeInTheDocument()
  })

  it('closing the diff view clears the active diff file', () => {
    renderGraph()
    act(() => useRepoUIStore.setState({ activeDiffFile: { path: 'a.ts', staged: false } }))
    ;(lastDiffViewCenterProps.current!.onClose as () => void)()
    expect(useRepoUIStore.getState().activeDiffFile).toBeNull()
  })
})

describe('GitGraph — overlay manager wiring', () => {
  it('forwards nodes/primaryOid/protectedBranches/pendingAction to the overlay manager', () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, git: { ...INITIAL_SETTINGS.settings.git, protectedBranches: ['main'] } },
    })
    useGitGraphActions.mockReturnValue(actionsState({ pendingAction: { kind: 'branch' } }))
    useCommitSelection.mockReturnValue(selectionState({ primaryOid: 'a' }))
    renderGraph()
    expect(lastOverlayManagerProps.current).toMatchObject({
      primaryOid: 'a',
      protectedBranches: ['main'],
      pendingAction: { kind: 'branch' },
    })
  })

  it('clears the pending action through the overlay manager callback', () => {
    const setPendingAction = vi.fn()
    useGitGraphActions.mockReturnValue(actionsState({ setPendingAction }))
    renderGraph()
    ;(lastOverlayManagerProps.current!.onClearPendingAction as () => void)()
    expect(setPendingAction).toHaveBeenCalledWith(null)
  })
})

describe('GitGraph — auto-select on branch/repo change', () => {
  it('selects the node matching the current branch ref', async () => {
    const selectSingle = vi.fn()
    const nodes = [commitNode('a', { refs: [{ name: 'refs/heads/main', shortName: 'main', type: 'branch', commitOid: 'a' }] })]
    useGitLog.mockReturnValue({ data: nodes, isLoading: false, isError: false })
    useGitGraphNodes.mockReturnValue(graphNodesState(nodes))
    useCommitSelection.mockReturnValue(selectionState({ selectSingle }))
    renderGraph({ branch: 'main' })
    await waitFor(() => expect(selectSingle).toHaveBeenCalledWith('a'))
  })

  it('falls back to the first node when nothing matches the branch/oid', async () => {
    const selectSingle = vi.fn()
    const nodes = [commitNode('first'), commitNode('second')]
    useGitLog.mockReturnValue({ data: nodes, isLoading: false, isError: false })
    useGitGraphNodes.mockReturnValue(graphNodesState(nodes))
    useCommitSelection.mockReturnValue(selectionState({ selectSingle }))
    renderGraph({ branch: 'unknown-branch' })
    await waitFor(() => expect(selectSingle).toHaveBeenCalledWith('first'))
  })

  it('does not auto-select the synthetic WIP node', async () => {
    const selectSingle = vi.fn()
    const nodes = [commitNode('WIP')]
    useGitLog.mockReturnValue({ data: nodes, isLoading: false, isError: false })
    useGitGraphNodes.mockReturnValue(graphNodesState(nodes))
    useCommitSelection.mockReturnValue(selectionState({ selectSingle }))
    renderGraph()
    await new Promise((r) => setTimeout(r, 0))
    expect(selectSingle).not.toHaveBeenCalled()
  })
})

describe('GitGraph — pending graph selection bridge', () => {
  it('selects the pending oid from the store and clears it', async () => {
    const selectSingle = vi.fn()
    useCommitSelection.mockReturnValue(selectionState({ selectSingle }))
    useRepoUIStore.setState({ pendingGraphSelection: 'CONFLICT' })
    renderGraph()
    await waitFor(() => expect(selectSingle).toHaveBeenCalledWith('CONFLICT'))
    expect(useRepoUIStore.getState().pendingGraphSelection).toBeNull()
  })
})

describe('GitGraph — conflict merge window', () => {
  it('opens a new merge window for the active conflict file path and clears it', async () => {
    useRepoUIStore.setState({ conflictFilePath: 'src/a.ts' })
    renderGraph()
    await waitFor(() => expect(WebviewWindowCtor).toHaveBeenCalledOnce())
    await waitFor(() => expect(useRepoUIStore.getState().conflictFilePath).toBeNull())
  })

  it('reuses an existing merge window instead of creating a new one', async () => {
    const existing = { show: vi.fn().mockResolvedValue(undefined), setFocus: vi.fn().mockResolvedValue(undefined) }
    webviewGetByLabel.mockResolvedValue(existing)
    useRepoUIStore.setState({ conflictFilePath: 'src/a.ts' })
    renderGraph()
    await waitFor(() => expect(existing.show).toHaveBeenCalledOnce())
    expect(WebviewWindowCtor).not.toHaveBeenCalled()
  })
})
