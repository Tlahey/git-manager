import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SidebarRow, SidebarSection } from './types'

const {
  useSidebarResize,
  useSidebarRows,
  useWorktreeWipStatuses,
  showStashNativeContextMenu,
  swrMutate,
} = vi.hoisted(() => ({
  useSidebarResize: vi.fn(),
  useSidebarRows: vi.fn(),
  useWorktreeWipStatuses: vi.fn(),
  showStashNativeContextMenu: vi.fn(),
  swrMutate: vi.fn(),
}))
vi.mock('../../hooks/useSidebarResize', () => ({ useSidebarResize, RAIL_WIDTH: 48 }))
vi.mock('../../hooks/useSidebarRows', () => ({ useSidebarRows }))
vi.mock('../../hooks/useWorktreeWipStatuses', () => ({ useWorktreeWipStatuses }))
vi.mock('../../api/nativeMenu.api', () => ({ showStashNativeContextMenu }))
vi.mock('../../api/git.api', () => ({
  apiStashApply: vi.fn(),
  apiStashPop: vi.fn(),
  apiStashDrop: vi.fn(),
}))
vi.mock('swr', () => ({ mutate: swrMutate }))

const { lastRowViewCalls } = vi.hoisted(() => ({
  lastRowViewCalls: { current: [] as Record<string, unknown>[] },
}))
vi.mock('./SidebarRowView', () => ({
  SidebarRowView: (props: Record<string, unknown>) => {
    lastRowViewCalls.current.push(props)
    return <div data-testid={`row-${(props.row as SidebarRow).id}`} />
  },
}))

const { lastHeaderCalls } = vi.hoisted(() => ({
  lastHeaderCalls: { current: [] as Record<string, unknown>[] },
}))
vi.mock('./SidebarSectionHeader', () => ({
  SidebarSectionHeader: (props: Record<string, unknown>) => {
    lastHeaderCalls.current.push(props)
    return (
      <button
        data-testid={`header-${props.sectionKey}`}
        onClick={props.onToggle as () => void}
      >
        {props.title as string}
      </button>
    )
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
vi.mock('./PruneWorktreesDialog', () => ({
  PruneWorktreesDialog: (props: { worktrees: { path: string }[]; open: boolean }) => (
    <div
      data-testid="prune-worktrees-dialog"
      data-open={props.open}
      data-count={props.worktrees?.length ?? 0}
    />
  ),
}))
vi.mock('./RemoveMergedWorktreesDialog', () => ({
  RemoveMergedWorktreesDialog: (props: { worktrees: { path: string }[]; open: boolean }) => (
    <div
      data-testid="remove-merged-worktrees-dialog"
      data-open={props.open}
      data-count={props.worktrees?.length ?? 0}
    />
  ),
}))

import { apiStashApply, apiStashPop, apiStashDrop } from '../../api/git.api'
import { RepositorySidebar } from './RepositorySidebar'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { usePinnedBranchesStore } from '../../stores/pinned-branches.store'
import { useSidebarSearchStore } from '../../stores/sidebarSearch.store'

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

function section(overrides: Partial<SidebarSection> = {}): SidebarSection {
  return { key: 'local', title: 'Local', isOpen: true, rows: [], ...overrides }
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
  lastHeaderCalls.current = []
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  usePinnedBranchesStore.setState(INITIAL_PINNED, true)
  useSidebarSearchStore.setState({ focusToken: 0 })
  useSidebarResize.mockReturnValue(resizeState())
  useSidebarRows.mockReturnValue({ sections: [], filterStats: { matched: 0, total: 0 } })
  useWorktreeWipStatuses.mockReturnValue({ data: [] })
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

  it('forwards the typed filter to SidebarRowView and marks section headers as filtered', async () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'local', rows: [row({ id: 'r1' })] })],
      filterStats: { matched: 1, total: 5 },
    })
    const user = userEvent.setup()
    renderSidebar()
    await user.type(screen.getByLabelText('Filtrer les branches'), 'feat')
    expect(lastRowViewCalls.current.at(-1)).toMatchObject({ filterQuery: 'feat' })
    expect(lastHeaderCalls.current.at(-1)).toMatchObject({ isFiltered: true })
  })

  it('does not mark section headers as filtered when the search box is empty', () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'local', rows: [row({ id: 'r1' })] })],
      filterStats: { matched: 0, total: 5 },
    })
    renderSidebar()
    expect(lastHeaderCalls.current.at(-1)).toMatchObject({ isFiltered: false })
    expect(lastRowViewCalls.current.at(-1)).toMatchObject({ filterQuery: '' })
  })

  it('shows the matched/total count above the search box only while filtering', async () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'local', rows: [row({ id: 'r1' })] })],
      filterStats: { matched: 3, total: 139 },
    })
    const user = userEvent.setup()
    renderSidebar()
    expect(screen.queryByTestId('sidebar-filter-stats')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Filtrer les branches'), 'feat')
    expect(screen.getByTestId('sidebar-filter-stats')).toHaveTextContent('3 / 139 résultats')
  })
})

describe('RepositorySidebar — focus shortcut (⌥⌘F)', () => {
  it('focuses and selects the filter input when the sidebar is already visible', () => {
    renderSidebar()
    const input = screen.getByLabelText('Filtrer les branches') as HTMLInputElement
    const focusSpy = vi.spyOn(input, 'focus')
    act(() => useSidebarSearchStore.getState().requestFocus())
    expect(focusSpy).toHaveBeenCalled()
  })

  it('expands the sidebar first when collapsed, then focuses the input', () => {
    const expand = vi.fn()
    useSidebarResize.mockReturnValue(resizeState({ isCollapsed: true, expand }))
    renderSidebar()
    act(() => useSidebarSearchStore.getState().requestFocus())
    expect(expand).toHaveBeenCalledOnce()
  })

  it('exits blame/history mode first when active, then focuses the input', () => {
    act(() => useRepoUIStore.setState({ activeLeftPanel: 'blame' }))
    renderSidebar()
    act(() => useSidebarSearchStore.getState().requestFocus())
    expect(useRepoUIStore.getState().activeLeftPanel).toBe('sidebar')
  })

  it('does nothing on initial render (token starts at 0)', () => {
    renderSidebar()
    const input = screen.getByLabelText('Filtrer les branches') as HTMLInputElement
    expect(document.activeElement).not.toBe(input)
  })
})

describe('RepositorySidebar — sections', () => {
  it('renders one section header per section and one SidebarRowView per body row', () => {
    useSidebarRows.mockReturnValue({
      sections: [
        section({ key: 'local', rows: [row({ id: 'r1' }), row({ id: 'r2' })] }),
        section({ key: 'remotes', rows: [] }),
      ],
    })
    const onContextMenu = vi.fn()
    const onOpenPr = vi.fn()
    renderSidebar({ onContextMenu, onOpenPr })
    expect(screen.getByTestId('header-local')).toBeInTheDocument()
    expect(screen.getByTestId('header-remotes')).toBeInTheDocument()
    expect(screen.getByTestId('row-r1')).toBeInTheDocument()
    expect(screen.getByTestId('row-r2')).toBeInTheDocument()
    expect(lastRowViewCalls.current[0]).toMatchObject({ onContextMenu, onOpenPr })
  })

  it('does not render body rows for a closed section', () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'tags', isOpen: false, rows: [] })],
    })
    renderSidebar()
    expect(screen.getByTestId('header-tags')).toBeInTheDocument()
    expect(lastRowViewCalls.current).toHaveLength(0)
  })

  it('gives every open section container flex-1 so open sections always share height equally (even a sparse one), and leaves closed ones flex-none', () => {
    useSidebarRows.mockReturnValue({
      sections: [
        section({ key: 'local', isOpen: true, rows: [] }),
        section({ key: 'remotes', isOpen: false, rows: [] }),
      ],
    })
    renderSidebar()
    expect(screen.getByTestId('sidebar-section-container-local')).toHaveClass('flex-1')
    expect(screen.getByTestId('sidebar-section-container-remotes')).toHaveClass('flex-none')
  })

  it("gives an open section container an explicit min-height floor (268px = header + body floor) so shrinking is deterministic — an automatic content-based floor previously caused sections to overlap instead of being pushed down", () => {
    useSidebarRows.mockReturnValue({
      sections: [
        section({ key: 'local', isOpen: true, rows: [] }),
        section({ key: 'remotes', isOpen: false, rows: [] }),
      ],
    })
    renderSidebar()
    expect(screen.getByTestId('sidebar-section-container-local')).toHaveStyle({
      minHeight: '148px',
    })
    expect(screen.getByTestId('sidebar-section-container-remotes').style.minHeight).toBe('')
  })

  it('the section list itself scrolls (not the individual sections) once open sections’ combined floors exceed the panel height', () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'local', isOpen: true, rows: [] })],
    })
    renderSidebar()
    const list = screen.getByTestId('sidebar-section-container-local').parentElement!
    expect(list).toHaveClass('min-h-0', 'overflow-y-auto')
  })

  it("gives an open section's body a min-height floor with no max-height, so equally-shared sections only shrink (never grow past their share) under space pressure", () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'local', isOpen: true, rows: [row({ id: 'r1' })] })],
    })
    renderSidebar()
    const body = screen.getByTestId('row-r1').parentElement!
    expect(body).toHaveClass('flex-1', 'overflow-y-auto')
    expect(body).toHaveStyle({ minHeight: '120px' })
    expect(body.style.maxHeight).toBe('')
  })

  it('forwards onCreateBranch to the local section header only', () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'local' }), section({ key: 'remotes', title: 'Remotes' })],
    })
    const onCreateBranch = vi.fn()
    renderSidebar({ onCreateBranch })
    expect(lastHeaderCalls.current[0]).toMatchObject({ sectionKey: 'local', onCreateBranch })
    expect(lastHeaderCalls.current[1]).toMatchObject({
      sectionKey: 'remotes',
      onCreateBranch: undefined,
    })
  })

  it('forwards onCreatePr to the prs section header only when a githubToken is set', () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'prs', title: 'Pull Requests' })],
    })
    renderSidebar({ githubToken: 'token' })
    expect(lastHeaderCalls.current[0]).toMatchObject({ sectionKey: 'prs' })
    expect(lastHeaderCalls.current[0].onCreatePr).toBeInstanceOf(Function)
  })

  it('omits onCreatePr on the prs section header when there is no githubToken', () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'prs', title: 'Pull Requests' })],
    })
    renderSidebar()
    expect(lastHeaderCalls.current[0].onCreatePr).toBeUndefined()
  })

  it('toggles a section open state via its header, feeding it back into useSidebarRows', () => {
    useSidebarRows.mockReturnValue({ sections: [section({ key: 'local', isOpen: true })] })
    renderSidebar()
    act(() => (lastHeaderCalls.current[0].onToggle as () => void)())
    expect(useSidebarRows).toHaveBeenLastCalledWith(
      expect.objectContaining({ openState: { 'section:local': false } })
    )
  })

  it('toggles a nested folder open state via openById, feeding it back into useSidebarRows', () => {
    useSidebarRows.mockReturnValue({
      sections: [
        section({
          key: 'local',
          rows: [
            {
              kind: 'folder',
              id: 'folder:feat/',
              prefix: 'feat/',
              count: 2,
              isOpen: true,
              hasHead: false,
            },
          ],
        }),
      ],
    })
    renderSidebar()
    act(() => (lastRowViewCalls.current[0].onToggleOpen as (id: string) => void)('folder:feat/'))
    expect(useSidebarRows).toHaveBeenLastCalledWith(
      expect.objectContaining({ openState: { 'folder:feat/': false } })
    )
  })

  it('forwards branch selection to onSelectBranch and pin toggling through the pinned-branches store', () => {
    useSidebarRows.mockReturnValue({ sections: [section({ rows: [row({ id: 'r1' })] })] })
    const { onSelectBranch } = renderSidebar()
    ;(lastRowViewCalls.current[0].onSelectBranch as (n: string) => void)('main')
    expect(onSelectBranch).toHaveBeenCalledWith('main')
    ;(lastRowViewCalls.current[0].onTogglePin as (n: string) => void)('feature')
    expect(usePinnedBranchesStore.getState().overrides['/repo']?.feature).toBe(true)
  })

  it('forwards hiddenStashes and wires stash-visibility toggling to the repoData store', () => {
    useRepoDataStore.setState({ hiddenStashes: { '/repo': ['oid1'] } })
    useSidebarRows.mockReturnValue({ sections: [section({ rows: [row({ id: 'r1' })] })] })
    renderSidebar()
    expect(lastRowViewCalls.current[0].hiddenStashes).toEqual(['oid1'])
    ;(lastRowViewCalls.current[0].onToggleStashVisibility as (oid: string) => void)('oid2')
    expect(useRepoDataStore.getState().hiddenStashes['/repo']).toContain('oid2')
  })

  it('opens the add-worktree dialog via the worktrees section header', () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'worktrees', title: 'Worktrees' })],
      prunableWorktrees: [],
    })
    renderSidebar()
    expect(screen.getByTestId('add-worktree-dialog')).toHaveAttribute('data-open', 'false')
    act(() => (lastHeaderCalls.current[0].onAddWorktree as () => void)())
    expect(screen.getByTestId('add-worktree-dialog')).toHaveAttribute('data-open', 'true')
  })

  it('opens the prune-worktrees dialog via the worktrees section header when there are prunable worktrees', () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'worktrees', title: 'Worktrees' })],
      prunableWorktrees: [{ path: '/tmp/stale', branch: 'old', isPrunable: true }],
    })
    renderSidebar()
    expect(screen.getByTestId('prune-worktrees-dialog')).toHaveAttribute('data-open', 'false')
    expect(screen.getByTestId('prune-worktrees-dialog')).toHaveAttribute('data-count', '1')
    act(() => (lastHeaderCalls.current[0].onPruneWorktrees as () => void)())
    expect(screen.getByTestId('prune-worktrees-dialog')).toHaveAttribute('data-open', 'true')
  })

  it('still passes onPruneWorktrees on the worktrees section header when nothing is prunable — the dialog itself shows the empty state', () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'worktrees', title: 'Worktrees' })],
      prunableWorktrees: [],
    })
    renderSidebar()
    expect(lastHeaderCalls.current[0].onPruneWorktrees).toBeInstanceOf(Function)
    expect(screen.getByTestId('prune-worktrees-dialog')).toHaveAttribute('data-count', '0')
  })

  it('opens the remove-merged-worktrees dialog via the worktrees section header, passing the full worktree list', () => {
    useSidebarRows.mockReturnValue({
      sections: [section({ key: 'worktrees', title: 'Worktrees' })],
      worktrees: [
        { path: '/tmp/a', branch: 'a', isPrunable: false },
        { path: '/tmp/b', branch: 'b', isPrunable: false },
      ],
    })
    renderSidebar()
    expect(screen.getByTestId('remove-merged-worktrees-dialog')).toHaveAttribute(
      'data-open',
      'false'
    )
    expect(screen.getByTestId('remove-merged-worktrees-dialog')).toHaveAttribute('data-count', '2')
    act(() => (lastHeaderCalls.current[0].onRemoveMergedWorktrees as () => void)())
    expect(screen.getByTestId('remove-merged-worktrees-dialog')).toHaveAttribute(
      'data-open',
      'true'
    )
  })

  it('passes the clicked worktree to the remove-worktree dialog via onRemoveWorktree', () => {
    useSidebarRows.mockReturnValue({ sections: [section({ rows: [row({ id: 'r1' })] })] })
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

  it('enters workspace mode via onOpenWorktree, without touching the tab bar', () => {
    useSidebarRows.mockReturnValue({ sections: [section({ rows: [row({ id: 'r1' })] })] })
    const openTabsBefore = useRepoUIStore.getState().openTabs
    const activeRepoBefore = useRepoUIStore.getState().activeRepo
    renderSidebar()
    act(() =>
      (
        lastRowViewCalls.current[0].onOpenWorktree as (wt: { path: string }) => void
      )({ path: '/tmp/repo-linked' })
    )
    expect(useRepoUIStore.getState().activeWorkspacePath).toBe('/tmp/repo-linked')
    // No new tab, and the tab identity/active repo itself is untouched.
    expect(useRepoUIStore.getState().openTabs).toBe(openTabsBefore)
    expect(useRepoUIStore.getState().activeRepo).toBe(activeRepoBefore)
  })

  it('passes the pending-changes bubble data through to SidebarRowView', () => {
    useSidebarRows.mockReturnValue({ sections: [section({ rows: [row({ id: 'r1' })] })] })
    const statuses = [
      { path: '/tmp/repo-linked', branch: 'feature/login', totalChanges: 2, added: 1, modified: 1, deleted: 0 },
    ]
    useWorktreeWipStatuses.mockReturnValue({ data: statuses })
    renderSidebar()
    expect(lastRowViewCalls.current[0].worktreeWipStatuses).toBe(statuses)
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
    useSidebarRows.mockReturnValue({ sections: [section({ rows: [row({ id: 'r1' })] })] })
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
    useSidebarRows.mockReturnValue({ sections: [section({ rows: [row({ id: 'r1' })] })] })
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
