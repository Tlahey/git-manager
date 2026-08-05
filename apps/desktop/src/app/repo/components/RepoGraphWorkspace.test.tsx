import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../components/git-graph/GitGraph', () => ({
  GitGraph: (props: { repoPath: string; branch?: string; soloBranches?: string[] }) => (
    <div data-testid="fake-git-graph">
      <span data-testid="graph-repo-path">{props.repoPath}</span>
      <span data-testid="graph-solo">{(props.soloBranches ?? []).join(',')}</span>
    </div>
  ),
}))
vi.mock('../../../components/repository-sidebar', () => ({
  RepositorySidebar: (props: { repoPath: string; remoteUrls?: string[] }) => (
    <div data-testid="fake-sidebar">
      <span data-testid="sidebar-repo-path">{props.repoPath}</span>
      <span data-testid="sidebar-remotes">{(props.remoteUrls ?? []).join(',')}</span>
    </div>
  ),
}))
vi.mock('../../../components/file-explorer/ProjectFilesView', () => ({
  ProjectFilesView: () => <div data-testid="fake-project-files" />,
}))
vi.mock('../../../components/file-explorer/FileTreeSidebar', () => ({
  FileTreeSidebar: () => <div data-testid="fake-file-tree-sidebar" />,
}))
vi.mock('../../../components/timeline/TimelineBar', () => ({
  TimelineBar: () => <div data-testid="fake-timeline-bar" />,
}))
vi.mock('../../../components/bisect/BisectSetupBanner', () => ({
  BisectSetupBanner: () => <div data-testid="fake-bisect-setup-banner" />,
}))
vi.mock('../../../components/git-graph/components/TagDialogsManager', () => ({
  TagDialogsManager: () => <div data-testid="fake-tag-dialogs" />,
}))
vi.mock('../../../hooks/useSidebarBranchMenu', () => ({
  useSidebarBranchMenu: () => ({
    openBranchMenu: vi.fn(),
    renameTarget: null,
    setRenameTarget: vi.fn(),
  }),
}))
vi.mock('../../../hooks/useSidebarTagMenu', () => ({
  useSidebarTagMenu: () => ({ openTagMenu: vi.fn() }),
}))
vi.mock('../../../components/git-graph/DeleteRemoteBranchDialog', () => ({
  DeleteRemoteBranchDialog: (props: { branchName: string; remote: string }) => (
    <div data-testid="fake-delete-remote-branch">{`${props.remote}/${props.branchName}`}</div>
  ),
}))
const { useEffectiveRepoSettingsMock, useBoardDataMock } = vi.hoisted(() => ({
  useEffectiveRepoSettingsMock: vi.fn(
    (): { viewSwitcherPosition: 'toolbar' | 'tabs' } => ({ viewSwitcherPosition: 'toolbar' })
  ),
  useBoardDataMock: vi.fn(
    (): {
      boards: { id: string; name: string }[]
      activeBoard: { id: string; name: string } | null
    } => ({ boards: [], activeBoard: null })
  ),
}))
vi.mock('../../../hooks/useEffectiveRepoSettings', () => ({
  useEffectiveRepoSettings: useEffectiveRepoSettingsMock,
}))
/**
 * One factory for the whole feature barrel — two `vi.mock` calls on the same module would leave only
 * the later one, and `BoardPage` would come back undefined.
 *
 * The controls store is the *real* one: this test drives it to open the board panel, so a stub would
 * make those cases assert against themselves. Imported from its own module rather than through
 * `importActual` on the barrel, which would pull the whole page in behind it — the thing being faked
 * two lines up.
 */
vi.mock('../../../features/board', async () => {
  const controls = await vi.importActual<
    typeof import('../../../features/board/stores/boardControls.store')
  >('../../../features/board/stores/boardControls.store')
  return {
    BoardPage: (props: { repoPath: string }) => (
      <div data-testid="fake-board-page">{props.repoPath}</div>
    ),
    useBoardData: useBoardDataMock,
    useBoardControlsStore: controls.useBoardControlsStore,
  }
})
// `RepoViewTabBar` has its own dedicated test — faked here so this stays a composition test of
// *whether* it renders, not a retest of its internals.
vi.mock('./RepoViewTabBar', () => ({
  RepoViewTabBar: (props: { boards: { id: string; name: string }[] }) => (
    <div data-testid="fake-repo-view-tab-bar">{props.boards.map((b) => b.name).join(',')}</div>
  ),
}))

import { RepoGraphWorkspace } from './RepoGraphWorkspace'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useFileExplorerStore } from '../../../stores/fileExplorer.store'
import { useBoardControlsStore } from '../../../features/board'
import { useSoloModeStore } from '../../../stores/soloMode.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'

const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_EXPLORER = useFileExplorerStore.getState()

beforeEach(() => {
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useFileExplorerStore.setState(INITIAL_EXPLORER, true)
  useBoardControlsStore.setState({ isOpen: false })
  useSoloModeStore.setState({ active: false, soloed: new Set() })
  useRepoUIStore.setState({ pendingTagDialog: null, pendingRemoteBranchDelete: null })
  useEffectiveRepoSettingsMock.mockReturnValue({ viewSwitcherPosition: 'toolbar' })
  useBoardDataMock.mockReturnValue({ boards: [], activeBoard: null })
})

describe('RepoGraphWorkspace', () => {
  it('shows the graph by default', () => {
    render(<RepoGraphWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('repo-graph-view')).toBeInTheDocument()
    expect(screen.getByTestId('fake-git-graph')).toBeInTheDocument()
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
    render(<RepoGraphWorkspace repoPath="/repo/wt" activeRepo="/repo" />)
    expect(screen.getByTestId('graph-repo-path')).toHaveTextContent('/repo/wt')
    expect(screen.getByTestId('sidebar-repo-path')).toHaveTextContent('/repo/wt')
    expect(screen.getByTestId('sidebar-remotes')).toHaveTextContent('origin')
  })

  it('swaps the graph for the file explorer when it is open', () => {
    useFileExplorerStore.setState({ isOpen: true, isSidebarOpen: true })
    render(<RepoGraphWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('fake-project-files')).toBeInTheDocument()
    expect(screen.getByTestId('fake-file-tree-sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('fake-git-graph')).not.toBeInTheDocument()
  })

  it('swaps the graph for the board when it is open', () => {
    useBoardControlsStore.setState({ isOpen: true })
    render(<RepoGraphWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('fake-board-page')).toHaveTextContent('/repo')
    expect(screen.queryByTestId('fake-git-graph')).not.toBeInTheDocument()
  })

  it('the board takes priority over the file explorer, and hides the file tree sidebar', () => {
    useBoardControlsStore.setState({ isOpen: true })
    useFileExplorerStore.setState({ isOpen: true, isSidebarOpen: true })
    render(<RepoGraphWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('fake-board-page')).toBeInTheDocument()
    expect(screen.queryByTestId('fake-project-files')).not.toBeInTheDocument()
    expect(screen.queryByTestId('fake-file-tree-sidebar')).not.toBeInTheDocument()
  })

  it('passes the soloed branches to the graph only while solo mode is on', () => {
    useSoloModeStore.setState({ active: true, soloed: new Set(['main']) })
    const { rerender } = render(<RepoGraphWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('graph-solo')).toHaveTextContent('main')
    useSoloModeStore.setState({ active: false })
    rerender(<RepoGraphWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('graph-solo')).toHaveTextContent('')
  })
})

/**
 * The ref-scoped dialogs are mounted here and nowhere else. `GitGraph` used to own a second copy of
 * this state, and it is unmounted whenever the file explorer opens — so a confirmation opened from
 * a tag badge disappeared the moment the user switched view, mid-action.
 */
describe('RepoGraphWorkspace — ref dialogs survive the graph being unmounted', () => {
  it('renders the remote-branch confirmation from the shared store', () => {
    useRepoUIStore.setState({ pendingRemoteBranchDelete: { remote: 'origin', branchName: 'feat' } })
    render(<RepoGraphWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('fake-delete-remote-branch')).toHaveTextContent('origin/feat')
  })

  it('keeps it open once the file explorer has replaced the graph', () => {
    useRepoUIStore.setState({ pendingRemoteBranchDelete: { remote: 'origin', branchName: 'feat' } })
    useFileExplorerStore.setState({ isOpen: true })
    render(<RepoGraphWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.queryByTestId('fake-git-graph')).not.toBeInTheDocument()
    expect(screen.getByTestId('fake-delete-remote-branch')).toBeInTheDocument()
    expect(screen.getByTestId('fake-tag-dialogs')).toBeInTheDocument()
  })

  it('draws each dialog once — two mount sites would double them', () => {
    useRepoUIStore.setState({ pendingRemoteBranchDelete: { remote: 'origin', branchName: 'feat' } })
    render(<RepoGraphWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getAllByTestId('fake-delete-remote-branch')).toHaveLength(1)
    expect(screen.getAllByTestId('fake-tag-dialogs')).toHaveLength(1)
  })
})

describe('RepoGraphWorkspace — view switcher tab bar', () => {
  it('does not render the tab bar when the effective position is "toolbar"', () => {
    useEffectiveRepoSettingsMock.mockReturnValue({ viewSwitcherPosition: 'toolbar' })
    render(<RepoGraphWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.queryByTestId('fake-repo-view-tab-bar')).not.toBeInTheDocument()
  })

  it('renders the tab bar with the board list when the effective position is "tabs"', () => {
    useEffectiveRepoSettingsMock.mockReturnValue({ viewSwitcherPosition: 'tabs' })
    useBoardDataMock.mockReturnValue({
      boards: [{ id: 'b1', name: 'Sprint 12' }],
      activeBoard: { id: 'b1', name: 'Sprint 12' },
    })
    render(<RepoGraphWorkspace repoPath="/repo" activeRepo="/repo" />)
    expect(screen.getByTestId('fake-repo-view-tab-bar')).toHaveTextContent('Sprint 12')
  })
})
