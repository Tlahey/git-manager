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

import { RepoGraphWorkspace } from './RepoGraphWorkspace'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useFileExplorerStore } from '../../../stores/fileExplorer.store'
import { useSoloModeStore } from '../../../stores/soloMode.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'

const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_EXPLORER = useFileExplorerStore.getState()

beforeEach(() => {
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useFileExplorerStore.setState(INITIAL_EXPLORER, true)
  useSoloModeStore.setState({ active: false, soloed: new Set() })
  useRepoUIStore.setState({ pendingTagDialog: null, pendingRemoteBranchDelete: null })
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
