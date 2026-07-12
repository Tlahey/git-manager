import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@git-manager/mascot', () => ({
  OctopusMascot: () => <div data-testid="octopus-mascot" />,
}))

const { dialogOpen } = vi.hoisted(() => ({ dialogOpen: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: dialogOpen }))
vi.mock('../../api/repo.api', () => ({ apiOpenRepo: vi.fn(), apiScanRepos: vi.fn() }))
vi.mock('../../components/tab-bar/CloneRepoDialog', () => ({
  CloneRepoDialog: (props: { open: boolean }) =>
    props.open ? <div data-testid="clone-dialog" /> : null,
}))
vi.mock('./components/ReadmePanel', () => ({
  ReadmePanel: (props: { path: string; onClose: () => void }) => (
    <div data-testid="readme-panel" data-path={props.path}>
      <button onClick={props.onClose}>close-readme</button>
    </div>
  ),
}))

const { lastRepoRowCalls } = vi.hoisted(() => ({
  lastRepoRowCalls: { current: [] as Record<string, unknown>[] },
}))
vi.mock('./components/RepoRow', () => ({
  RepoRow: (props: Record<string, unknown>) => {
    lastRepoRowCalls.current.push(props)
    return (
      <div data-testid={`repo-row-${props.path}`}>
        {props.name as string}
        <button onClick={props.onToggleReadme as () => void}>
          toggle-readme-{props.path as string}
        </button>
      </div>
    )
  },
}))

import { apiOpenRepo, apiScanRepos } from '../../api/repo.api'
import { DashboardPage } from './DashboardPage'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

const mockedOpenRepo = apiOpenRepo as unknown as ReturnType<typeof vi.fn>
const mockedScanRepos = apiScanRepos as unknown as ReturnType<typeof vi.fn>
const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_REPO_UI = useRepoUIStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  lastRepoRowCalls.current = []
  useRepoDataStore.setState({ ...INITIAL_REPO_DATA, savedRepos: [], discoveredRepos: [] })
  useRepoUIStore.setState({ ...INITIAL_REPO_UI, openTabs: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DashboardPage — empty state', () => {
  it('shows the mascot and an empty-state message when there are no known repos', () => {
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    expect(screen.getByTestId('octopus-mascot')).toBeInTheDocument()
    expect(screen.getByText('dashboard.noAllRepos')).toBeInTheDocument()
  })

  it('hides the search bar when there are no known repos', () => {
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    expect(screen.queryByPlaceholderText('dashboard.searchPlaceholder')).not.toBeInTheDocument()
  })
})

describe('DashboardPage — sections', () => {
  beforeEach(() => {
    useRepoDataStore.setState({
      savedRepos: [
        { path: '/repo/a', name: 'repo-a', pinned: true },
        { path: '/repo/b', name: 'repo-b', pinned: false },
      ],
      discoveredRepos: [{ path: '/repo/c', name: 'repo-c' }],
    })
  })

  it('lists open tabs, favorites, and all repos with correct counts', () => {
    // /repo/a is both a favorite and in "all repos"; /repo/b is both an open tab and in "all
    // repos" — each section renders its own RepoRow, so both legitimately appear twice.
    useRepoUIStore.setState({ openTabs: ['/repo/b'] })
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    expect(screen.getAllByTestId('repo-row-/repo/b')).toHaveLength(2) // open tab + all
    expect(screen.getAllByTestId('repo-row-/repo/a')).toHaveLength(2) // favorite + all
    expect(screen.getByTestId('repo-row-/repo/c')).toBeInTheDocument() // discovered, all only
  })

  it('shows empty-section messages when a section has nothing', () => {
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    expect(screen.getByText('dashboard.noTabs')).toBeInTheDocument() // no open tabs
  })

  it('passes isSaved/isPinned correctly to RepoRow', () => {
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    const rowA = lastRepoRowCalls.current.find((c) => c.path === '/repo/a' && c.isPinned === true)
    expect(rowA).toMatchObject({ isSaved: true, isPinned: true })
    const rowC = lastRepoRowCalls.current.find((c) => c.path === '/repo/c')
    expect(rowC).toMatchObject({ isSaved: false, isPinned: false })
  })

  it('filters all sections by the search text', async () => {
    const user = userEvent.setup()
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('dashboard.searchPlaceholder'), 'repo-a')
    // /repo/a matches in both the favorites and all-repos sections.
    expect(screen.getAllByTestId('repo-row-/repo/a')).toHaveLength(2)
    expect(screen.queryByTestId('repo-row-/repo/b')).not.toBeInTheDocument()
    expect(screen.queryByTestId('repo-row-/repo/c')).not.toBeInTheDocument()
  })

  it('clears the search filter', async () => {
    const user = userEvent.setup()
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    const input = screen.getByPlaceholderText('dashboard.searchPlaceholder')
    await user.type(input, 'repo-a')
    await user.click(screen.getByRole('button', { name: '' }))
    expect(input).toHaveValue('')
  })
})

describe('DashboardPage — README panel toggle', () => {
  beforeEach(() => {
    useRepoDataStore.setState({ savedRepos: [{ path: '/repo/a', name: 'repo-a', pinned: false }] })
  })

  it('opens the readme panel for a repo, and closes it when toggled again', async () => {
    const user = userEvent.setup()
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    expect(screen.queryByTestId('readme-panel')).not.toBeInTheDocument()

    await user.click(screen.getByText('toggle-readme-/repo/a'))
    expect(screen.getByTestId('readme-panel')).toHaveAttribute('data-path', '/repo/a')

    await user.click(screen.getByText('toggle-readme-/repo/a'))
    expect(screen.queryByTestId('readme-panel')).not.toBeInTheDocument()
  })

  it('closes the readme panel via its own onClose', async () => {
    const user = userEvent.setup()
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    await user.click(screen.getByText('toggle-readme-/repo/a'))
    await user.click(screen.getByText('close-readme'))
    expect(screen.queryByTestId('readme-panel')).not.toBeInTheDocument()
  })
})

describe('DashboardPage — header actions', () => {
  it('calls onOpenSettings from the settings button', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<DashboardPage onOpenSettings={onOpenSettings} />)
    await user.click(screen.getByTitle('Paramètres'))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('opens the clone dialog', async () => {
    const user = userEvent.setup()
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    expect(screen.queryByTestId('clone-dialog')).not.toBeInTheDocument()
    await user.click(screen.getByText('dashboard.clone'))
    expect(screen.getByTestId('clone-dialog')).toBeInTheDocument()
  })

  it('opens a repo via the file picker, adds it to the store, and opens its tab', async () => {
    dialogOpen.mockResolvedValue('/Users/me/projects/new-repo')
    mockedOpenRepo.mockResolvedValue({
      path: '/Users/me/projects/new-repo',
      name: 'new-repo',
      head: 'main',
      isDetached: false,
      isDirty: false,
      remotes: [],
    })
    const user = userEvent.setup()
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    await user.click(screen.getByText('dashboard.browse'))

    expect(mockedOpenRepo).toHaveBeenCalledWith('/Users/me/projects/new-repo')
    expect(useRepoUIStore.getState().openTabs).toContain('/Users/me/projects/new-repo')
  })

  it('does nothing when the open-repo picker is dismissed', async () => {
    dialogOpen.mockResolvedValue(null)
    const user = userEvent.setup()
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    await user.click(screen.getByText('dashboard.browse'))
    expect(mockedOpenRepo).not.toHaveBeenCalled()
  })

  it('shows an inline error when opening a repo fails', async () => {
    dialogOpen.mockResolvedValue('/bad/path')
    mockedOpenRepo.mockRejectedValue(new Error('not a git repo'))
    const user = userEvent.setup()
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    await user.click(screen.getByText('dashboard.browse'))
    expect(await screen.findByText(/not a git repo/)).toBeInTheDocument()
  })

  it('scans a folder and adds every discovered repo', async () => {
    dialogOpen.mockResolvedValue('/Users/me/projects')
    mockedScanRepos.mockResolvedValue(['/Users/me/projects/repo-x', '/Users/me/projects/repo-y'])
    const user = userEvent.setup()
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    await user.click(screen.getByText('dashboard.scanFolder'))

    expect(mockedScanRepos).toHaveBeenCalledWith('/Users/me/projects', 4)
    expect(await screen.findByTestId('repo-row-/Users/me/projects/repo-x')).toBeInTheDocument()
    expect(screen.getByTestId('repo-row-/Users/me/projects/repo-y')).toBeInTheDocument()
  })

  it('shows an inline error when scanning fails', async () => {
    dialogOpen.mockResolvedValue('/Users/me/projects')
    mockedScanRepos.mockRejectedValue(new Error('scan failed'))
    const user = userEvent.setup()
    render(<DashboardPage onOpenSettings={vi.fn()} />)
    await user.click(screen.getByText('dashboard.scanFolder'))
    expect(await screen.findByText(/scan failed/)).toBeInTheDocument()
  })
})
