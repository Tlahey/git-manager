import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * One factory per feature barrel — several `vi.mock` calls on the same module would leave only the
 * last one, and every other export would come back undefined.
 */
vi.mock('../../../features/graph', () => ({
  GitGraph: (props: { repoPath: string; branch?: string; soloBranches?: string[] }) => (
    <div data-testid="fake-git-graph">
      <span data-testid="graph-repo-path">{props.repoPath}</span>
      <span data-testid="graph-solo">{(props.soloBranches ?? []).join(',')}</span>
    </div>
  ),
  RepositorySidebar: (props: { repoPath: string; remoteUrls?: string[] }) => (
    <div data-testid="fake-sidebar">
      <span data-testid="sidebar-repo-path">{props.repoPath}</span>
      <span data-testid="sidebar-remotes">{(props.remoteUrls ?? []).join(',')}</span>
    </div>
  ),
  TagDialogsManager: () => <div data-testid="fake-tag-dialogs" />,
  DeleteRemoteBranchDialog: (props: { branchName: string; remote: string }) => (
    <div data-testid="fake-delete-remote-branch">{`${props.remote}/${props.branchName}`}</div>
  ),
  RenameBranchDialog: () => <div data-testid="fake-rename-branch" />,
  CompareBranchesDialog: () => <div data-testid="fake-compare-branches" />,
  SetUpstreamDialog: () => <div data-testid="fake-set-upstream" />,
  useSidebarBranchMenu: () => ({
    openBranchMenu: vi.fn(),
    renameTarget: null,
    setRenameTarget: vi.fn(),
  }),
  useSidebarTagMenu: () => ({ openTagMenu: vi.fn() }),
}))
vi.mock('../../../components/diff-viewer/BlameHistoryPanel', () => ({
  BlameHistoryPanel: () => <div data-testid="fake-blame-history" />,
}))
vi.mock('../../../components/timeline/TimelineBar', () => ({
  TimelineBar: () => <div data-testid="fake-timeline-bar" />,
}))
vi.mock('../../../components/bisect/BisectSetupBanner', () => ({
  BisectSetupBanner: () => <div data-testid="fake-bisect-setup-banner" />,
}))
const { useBoardDataMock } = vi.hoisted(() => ({
  useBoardDataMock: vi.fn(
    (): {
      boards: { id: string; name: string }[]
      activeBoard: { id: string; name: string } | null
    } => ({ boards: [], activeBoard: null })
  ),
}))
/**
 * One factory per feature barrel — two `vi.mock` calls on the same module would leave only the later
 * one, and the page would come back undefined.
 */
vi.mock('../../../features/board', () => ({
  BoardPage: (props: { repoPath: string }) => (
    <div data-testid="fake-board-page">{props.repoPath}</div>
  ),
  BoardSidebar: () => <div data-testid="fake-board-sidebar" />,
  useBoardData: useBoardDataMock,
}))
/**
 * The explorer store is the *real* one: this test drives it to fold the file tree away, so a stub
 * would make that case assert against itself. Imported from its own module rather than through
 * `importActual` on the barrel, which would pull the whole page in behind it — the thing being faked
 * two lines down.
 */
vi.mock('../../../features/files', async () => {
  const store = await vi.importActual<
    typeof import('../../../features/files/stores/fileExplorer.store')
  >('../../../features/files/stores/fileExplorer.store')
  return {
    FilesPage: () => <div data-testid="fake-project-files" />,
    FileTreeSidebar: () => <div data-testid="fake-file-tree-sidebar" />,
    useFileExplorerStore: store.useFileExplorerStore,
  }
})
// `RepoViewTabBar` has its own dedicated test — faked here so this stays a composition test of
// *whether* it renders, not a retest of its internals.
vi.mock('./RepoViewTabBar', () => ({
  RepoViewTabBar: (props: { boards: { id: string; name: string }[] }) => (
    <div data-testid="fake-repo-view-tab-bar">{props.boards.map((b) => b.name).join(',')}</div>
  ),
}))

import { RepoWorkspace } from './RepoWorkspace'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoViewStore } from '../../../stores/repoView.store'
import { useFileExplorerStore } from '../../../features/files'
import { useSoloModeStore } from '../../../stores/soloMode.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'

const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_EXPLORER = useFileExplorerStore.getState()

beforeEach(() => {
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useFileExplorerStore.setState(INITIAL_EXPLORER, true)
  useRepoViewStore.setState({ view: 'graph' })
  useSoloModeStore.setState({ active: false, soloed: new Set() })
  useRepoUIStore.setState({
    pendingTagDialog: null,
    pendingRemoteBranchDelete: null,
    activeLeftPanel: 'sidebar',
  })
  useBoardDataMock.mockReturnValue({ boards: [], activeBoard: null })
})

describe('RepoWorkspace', () => {
  it('shows the graph and the branch sidebar by default', () => {
    render(<RepoWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('repo-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('fake-git-graph')).toBeInTheDocument()
    expect(screen.getByTestId('fake-sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('fake-project-files')).not.toBeInTheDocument()
  })

  it('shows the viewed path in the graph/sidebar but the tab’s own repo remotes', () => {
    useRepoDataStore.setState({
      repoCache: {
        '/repo': {
          path: '/repo',
          name: 'repo',
          head: 'main',
          isDetached: false,
          isDirty: false,
          remotes: ['origin'],
        },
      },
    })
    render(<RepoWorkspace repoPath="/repo/wt" activeRepo="/repo" />)
    expect(screen.getByTestId('graph-repo-path')).toHaveTextContent('/repo/wt')
    expect(screen.getByTestId('sidebar-repo-path')).toHaveTextContent('/repo/wt')
    expect(screen.getByTestId('sidebar-remotes')).toHaveTextContent('origin')
  })

  /** The point of the whole split: each view brings its own panel, and the previous view's goes
   * with it. A branch list beside a Kanban is a command for a screen that isn't there. */
  it('gives the files view its own tree in the panel slot, and drops the branch sidebar', () => {
    useRepoViewStore.setState({ view: 'files' })
    render(<RepoWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('fake-project-files')).toBeInTheDocument()
    expect(screen.getByTestId('fake-file-tree-sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('fake-sidebar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('fake-git-graph')).not.toBeInTheDocument()
  })

  it('folds the file tree away without leaving the files view', () => {
    useRepoViewStore.setState({ view: 'files' })
    useFileExplorerStore.setState({ isSidebarOpen: false })
    render(<RepoWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('fake-project-files')).toBeInTheDocument()
    expect(screen.queryByTestId('fake-file-tree-sidebar')).not.toBeInTheDocument()
  })

  /**
   * Blame and history are a *file's* panel, not a view's: they are opened from the diff viewer, which
   * the files view has too. Before the panel became view-scoped this came for free, because the graph's
   * sidebar was mounted on every view and swapped itself out for them.
   */
  it('gives blame the panel slot on the files view, ahead of the tree', () => {
    useRepoViewStore.setState({ view: 'files' })
    useRepoUIStore.setState({ activeLeftPanel: 'blame' })
    render(<RepoWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('fake-blame-history')).toBeInTheDocument()
    expect(screen.queryByTestId('fake-file-tree-sidebar')).not.toBeInTheDocument()
  })

  it('gives the board view its board list in the panel slot', () => {
    useRepoViewStore.setState({ view: 'board' })
    render(<RepoWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('fake-board-page')).toHaveTextContent('/repo')
    expect(screen.getByTestId('fake-board-sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('fake-sidebar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('fake-git-graph')).not.toBeInTheDocument()
  })

  it('passes the soloed branches to the graph only while solo mode is on', () => {
    useSoloModeStore.setState({ active: true, soloed: new Set(['main']) })
    const { rerender } = render(<RepoWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('graph-solo')).toHaveTextContent('main')
    useSoloModeStore.setState({ active: false })
    rerender(<RepoWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('graph-solo')).toHaveTextContent('')
  })
})

/**
 * The ref-scoped dialogs are mounted here and nowhere else. `GitGraph` used to own a second copy of
 * this state, and it is unmounted whenever another view takes the central area — so a confirmation
 * opened from a tag badge disappeared the moment the user switched view, mid-action.
 */
describe('RepoWorkspace — ref dialogs survive the graph being unmounted', () => {
  it('renders the remote-branch confirmation from the shared store', () => {
    useRepoUIStore.setState({ pendingRemoteBranchDelete: { remote: 'origin', branchName: 'feat' } })
    render(<RepoWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('fake-delete-remote-branch')).toHaveTextContent('origin/feat')
  })

  it('keeps it open once another view has replaced the graph', () => {
    useRepoUIStore.setState({ pendingRemoteBranchDelete: { remote: 'origin', branchName: 'feat' } })
    useRepoViewStore.setState({ view: 'files' })
    render(<RepoWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.queryByTestId('fake-git-graph')).not.toBeInTheDocument()
    expect(screen.getByTestId('fake-delete-remote-branch')).toBeInTheDocument()
    expect(screen.getByTestId('fake-tag-dialogs')).toBeInTheDocument()
  })

  it('draws each dialog once — two mount sites would double them', () => {
    useRepoUIStore.setState({ pendingRemoteBranchDelete: { remote: 'origin', branchName: 'feat' } })
    render(<RepoWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getAllByTestId('fake-delete-remote-branch')).toHaveLength(1)
    expect(screen.getAllByTestId('fake-tag-dialogs')).toHaveLength(1)
  })
})

describe('RepoWorkspace — view switcher tab bar', () => {
  /** There is one switcher now, and it is always on: a view change swaps the toolbar and the panel
   * with it, which is a navigation, and a navigation the user cannot see is one they cannot make. */
  it('always renders the tab bar, with the board list in it', () => {
    useBoardDataMock.mockReturnValue({
      boards: [{ id: 'b1', name: 'Sprint 12' }],
      activeBoard: { id: 'b1', name: 'Sprint 12' },
    })
    render(<RepoWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('fake-repo-view-tab-bar')).toHaveTextContent('Sprint 12')
  })
})
