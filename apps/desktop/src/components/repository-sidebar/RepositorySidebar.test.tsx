import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SidebarRow } from './types'

const { useSidebarResize, useSidebarRows, showStashNativeContextMenu, swrMutate } = vi.hoisted(
  () => ({
    useSidebarResize: vi.fn(),
    useSidebarRows: vi.fn(),
    showStashNativeContextMenu: vi.fn(),
    swrMutate: vi.fn(),
  })
)
vi.mock('../../hooks/useSidebarResize', () => ({ useSidebarResize, RAIL_WIDTH: 48 }))
vi.mock('../../hooks/useSidebarRows', () => ({ useSidebarRows }))
vi.mock('../../api/nativeMenu.api', () => ({ showStashNativeContextMenu }))
vi.mock('../../api/git.api', () => ({
  apiStashApply: vi.fn(),
  apiStashPop: vi.fn(),
  apiStashDrop: vi.fn(),
}))
vi.mock('swr', () => ({ mutate: swrMutate }))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: (i: number) => number }) => ({
    getTotalSize: () =>
      Array.from({ length: opts.count }, (_, i) => opts.estimateSize(i)).reduce((a, b) => a + b, 0),
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, index) => ({ key: index, index, start: 0 })),
    measureElement: () => {},
  }),
}))

const { lastRowViewCalls } = vi.hoisted(() => ({
  lastRowViewCalls: { current: [] as Record<string, unknown>[] },
}))
vi.mock('./SidebarRowView', () => ({
  SidebarRowView: (props: Record<string, unknown>) => {
    lastRowViewCalls.current.push(props)
    return <div data-testid={`row-${(props.row as SidebarRow).id}`} />
  },
}))
vi.mock('./SidebarRail', () => ({
  SidebarRail: (props: { onExpand: () => void }) => (
    <button data-testid="sidebar-rail" onClick={props.onExpand} />
  ),
}))
vi.mock('./BlameHistoryPanel', () => ({
  BlameHistoryPanel: (props: { file: unknown; onClose: () => void }) => (
    <div data-testid="blame-history-panel" onClick={props.onClose} />
  ),
}))
vi.mock('./SidebarResizeHandle', () => ({
  SidebarResizeHandle: () => <div data-testid="resize-handle" />,
}))
vi.mock('./AddWorktreeDialog', () => ({
  AddWorktreeDialog: (props: { open: boolean }) => (
    <div data-testid="add-worktree-dialog" data-open={props.open} />
  ),
}))
vi.mock('./RemoveWorktreeDialog', () => ({
  RemoveWorktreeDialog: (props: { worktree: { path: string } | null }) => (
    <div data-testid="remove-worktree-dialog" data-worktree={props.worktree?.path ?? ''} />
  ),
}))

import { apiStashApply, apiStashPop, apiStashDrop } from '../../api/git.api'
import { RepositorySidebar } from './RepositorySidebar'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { usePinnedBranchesStore } from '../../stores/pinned-branches.store'

const mockedStashApply = apiStashApply as unknown as ReturnType<typeof vi.fn>
const mockedStashPop = apiStashPop as unknown as ReturnType<typeof vi.fn>
const mockedStashDrop = apiStashDrop as unknown as ReturnType<typeof vi.fn>

const INITIAL_REPO_UI = useRepoUIStore.getState()
const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_PINNED = usePinnedBranchesStore.getState()

function resizeState(overrides: Partial<ReturnType<typeof useSidebarResize>> = {}) {
  return {
    width: 280,
    isCollapsed: false,
    collapse: vi.fn(),
    expand: vi.fn(),
    resizeHandleProps: {},
    ...overrides,
  }
}

function row(overrides: Partial<SidebarRow> = {}): SidebarRow {
  return { kind: 'divider', id: 'row-1', ...overrides } as SidebarRow
}

function renderSidebar(props: Partial<React.ComponentProps<typeof RepositorySidebar>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const onSelectBranch = vi.fn()
  const utils = render(
    <QueryClientProvider client={client}>
      <RepositorySidebar
        repoPath="/repo"
        selectedBranch={null}
        onSelectBranch={onSelectBranch}
        {...props}
      />
    </QueryClientProvider>
  )
  return { ...utils, invalidateSpy, onSelectBranch }
}

beforeEach(() => {
  vi.clearAllMocks()
  lastRowViewCalls.current = []
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  usePinnedBranchesStore.setState(INITIAL_PINNED, true)
  useSidebarResize.mockReturnValue(resizeState())
  useSidebarRows.mockReturnValue({ rows: [] })
})

describe('RepositorySidebar — mode routing', () => {
  it('shows the collapsed rail when isCollapsed', () => {
    useSidebarResize.mockReturnValue(resizeState({ isCollapsed: true }))
    renderSidebar()
    expect(screen.getByTestId('sidebar-rail')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filtrer les branches')).not.toBeInTheDocument()
  })

  it('expands from the rail via onExpand', async () => {
    const expand = vi.fn()
    useSidebarResize.mockReturnValue(resizeState({ isCollapsed: true, expand }))
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByTestId('sidebar-rail'))
    expect(expand).toHaveBeenCalledOnce()
  })

  it('shows the BlameHistoryPanel when the left panel is in blame/history mode', () => {
    act(() => useRepoUIStore.setState({ activeLeftPanel: 'blame' }))
    renderSidebar()
    expect(screen.getByTestId('blame-history-panel')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filtrer les branches')).not.toBeInTheDocument()
  })

  it('closing the blame/history panel resets the left panel to "sidebar"', async () => {
    act(() => useRepoUIStore.setState({ activeLeftPanel: 'history' }))
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByTestId('blame-history-panel'))
    expect(useRepoUIStore.getState().activeLeftPanel).toBe('sidebar')
  })

  it('shows the full sidebar (header/search/rows) otherwise', () => {
    renderSidebar()
    expect(screen.getByText('Repository')).toBeInTheDocument()
    expect(screen.getByLabelText('Filtrer les branches')).toBeInTheDocument()
  })

  it('collapses the sidebar from the header button', async () => {
    const collapse = vi.fn()
    useSidebarResize.mockReturnValue(resizeState({ collapse }))
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByLabelText('Réduire la sidebar'))
    expect(collapse).toHaveBeenCalledOnce()
  })
})

describe('RepositorySidebar — search filter', () => {
  it('passes the typed filter through to useSidebarRows', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.type(screen.getByLabelText('Filtrer les branches'), 'feat')
    expect(useSidebarRows).toHaveBeenLastCalledWith(expect.objectContaining({ filter: 'feat' }))
  })

  it('clears the filter via the clear button', async () => {
    const user = userEvent.setup()
    renderSidebar()
    const input = screen.getByLabelText('Filtrer les branches')
    await user.type(input, 'feat')
    await user.click(screen.getByLabelText('Effacer le filtre'))
    expect(input).toHaveValue('')
  })
})

describe('RepositorySidebar — rows', () => {
  it('renders one SidebarRowView per row and forwards the standard callbacks', () => {
    useSidebarRows.mockReturnValue({ rows: [row({ id: 'r1' }), row({ id: 'r2' })] })
    const onContextMenu = vi.fn()
    const onOpenPr = vi.fn()
    const onCreateBranch = vi.fn()
    renderSidebar({ onContextMenu, onOpenPr, onCreateBranch })
    expect(screen.getByTestId('row-r1')).toBeInTheDocument()
    expect(screen.getByTestId('row-r2')).toBeInTheDocument()
    expect(lastRowViewCalls.current[0]).toMatchObject({ onContextMenu, onOpenPr, onCreateBranch })
  })

  it('toggles a section/folder open state, feeding it back into useSidebarRows on the next render', () => {
    useSidebarRows.mockReturnValue({
      rows: [
        {
          kind: 'section',
          id: 'sec-local',
          sectionKey: 'local',
          title: 'Local',
          isOpen: true,
        } as SidebarRow,
      ],
    })
    renderSidebar()
    act(() => (lastRowViewCalls.current[0].onToggleOpen as (id: string) => void)('sec-local'))
    expect(useSidebarRows).toHaveBeenLastCalledWith(
      expect.objectContaining({ openState: { 'sec-local': false } })
    )
  })

  it('forwards branch selection to onSelectBranch and pin toggling through the pinned-branches store', () => {
    useSidebarRows.mockReturnValue({ rows: [row({ id: 'r1' })] })
    const { onSelectBranch } = renderSidebar()
    ;(lastRowViewCalls.current[0].onSelectBranch as (n: string) => void)('main')
    expect(onSelectBranch).toHaveBeenCalledWith('main')
    ;(lastRowViewCalls.current[0].onTogglePin as (n: string) => void)('feature')
    expect(usePinnedBranchesStore.getState().overrides['/repo']?.feature).toBe(true)
  })

  it('forwards hiddenStashes and wires stash-visibility toggling to the repoData store', () => {
    useRepoDataStore.setState({ hiddenStashes: { '/repo': ['oid1'] } })
    useSidebarRows.mockReturnValue({ rows: [row({ id: 'r1' })] })
    renderSidebar()
    expect(lastRowViewCalls.current[0].hiddenStashes).toEqual(['oid1'])
    ;(lastRowViewCalls.current[0].onToggleStashVisibility as (oid: string) => void)('oid2')
    expect(useRepoDataStore.getState().hiddenStashes['/repo']).toContain('oid2')
  })

  it('opens the add-worktree dialog via onAddWorktree', async () => {
    useSidebarRows.mockReturnValue({ rows: [row({ id: 'r1' })] })
    renderSidebar()
    expect(screen.getByTestId('add-worktree-dialog')).toHaveAttribute('data-open', 'false')
    act(() => (lastRowViewCalls.current[0].onAddWorktree as () => void)())
    expect(screen.getByTestId('add-worktree-dialog')).toHaveAttribute('data-open', 'true')
  })

  it('passes the clicked worktree to the remove-worktree dialog via onRemoveWorktree', () => {
    useSidebarRows.mockReturnValue({ rows: [row({ id: 'r1' })] })
    renderSidebar()
    expect(screen.getByTestId('remove-worktree-dialog')).toHaveAttribute('data-worktree', '')
    act(() =>
      (
        lastRowViewCalls.current[0].onRemoveWorktree as (wt: { path: string }) => void
      )({ path: '/tmp/repo-linked' })
    )
    expect(screen.getByTestId('remove-worktree-dialog')).toHaveAttribute(
      'data-worktree',
      '/tmp/repo-linked'
    )
  })
})

describe('RepositorySidebar — stash context menu', () => {
  function stash() {
    return {
      index: 0,
      message: 'WIP',
      branch: 'main',
      commitOid: 'stash-oid',
      timestamp: 0,
      filesCount: 1,
      additions: 0,
      deletions: 0,
    }
  }

  function triggerStashContextMenu() {
    useSidebarRows.mockReturnValue({ rows: [row({ id: 'r1' })] })
    renderSidebar()
    ;(
      lastRowViewCalls.current[0].onStashContextMenu as (
        e: unknown,
        s: ReturnType<typeof stash>
      ) => void
    )({}, stash())
  }

  it('opens the native menu with isHidden reflecting the repoData store', () => {
    useRepoDataStore.setState({ hiddenStashes: { '/repo': ['stash-oid'] } })
    showStashNativeContextMenu.mockResolvedValue(undefined)
    triggerStashContextMenu()
    expect(showStashNativeContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ isHidden: true })
    )
  })

  it('applies the stash, refreshes stashes/log/status, on "apply"', async () => {
    mockedStashApply.mockResolvedValue(undefined)
    showStashNativeContextMenu.mockResolvedValue(undefined)
    triggerStashContextMenu()
    const args = showStashNativeContextMenu.mock.calls[0][0]
    await act(async () => args.onApply())
    expect(mockedStashApply).toHaveBeenCalledWith('/repo', 0)
    expect(swrMutate).toHaveBeenCalledWith(['git-stashes', '/repo'])
  })

  it('pops the stash on "pop"', async () => {
    mockedStashPop.mockResolvedValue(undefined)
    showStashNativeContextMenu.mockResolvedValue(undefined)
    triggerStashContextMenu()
    const args = showStashNativeContextMenu.mock.calls[0][0]
    await act(async () => args.onPop())
    expect(mockedStashPop).toHaveBeenCalledWith('/repo', 0)
  })

  it('drops the stash on "delete"', async () => {
    mockedStashDrop.mockResolvedValue(undefined)
    showStashNativeContextMenu.mockResolvedValue(undefined)
    triggerStashContextMenu()
    const args = showStashNativeContextMenu.mock.calls[0][0]
    await act(async () => args.onDelete())
    expect(mockedStashDrop).toHaveBeenCalledWith('/repo', 0)
  })

  it('alerts when the apply/pop/delete action fails', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    mockedStashApply.mockRejectedValue(new Error('apply failed'))
    showStashNativeContextMenu.mockResolvedValue(undefined)
    triggerStashContextMenu()
    const args = showStashNativeContextMenu.mock.calls[0][0]
    await act(async () => args.onApply())
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('apply failed'))
  })

  it('routes to edit-message: selects the stash commit and sets editingOid', () => {
    showStashNativeContextMenu.mockResolvedValue(undefined)
    useSidebarRows.mockReturnValue({ rows: [row({ id: 'r1' })] })
    const { onSelectBranch } = renderSidebar()
    ;(
      lastRowViewCalls.current.at(-1)!.onStashContextMenu as (
        e: unknown,
        s: ReturnType<typeof stash>
      ) => void
    )({}, stash())
    const args = showStashNativeContextMenu.mock.calls[0][0]
    act(() => args.onEditMessage())
    expect(onSelectBranch).toHaveBeenCalledWith('stash-oid')
    expect(useRepoUIStore.getState().editingOid).toBe('stash-oid')
  })

  it('toggles stash visibility through the repoData store', () => {
    showStashNativeContextMenu.mockResolvedValue(undefined)
    triggerStashContextMenu()
    const args = showStashNativeContextMenu.mock.calls[0][0]
    act(() => args.onToggleVisibility())
    expect(useRepoDataStore.getState().hiddenStashes['/repo']).toContain('stash-oid')
  })
})
