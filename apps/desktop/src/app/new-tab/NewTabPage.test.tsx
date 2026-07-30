import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitRepo } from '@git-manager/git-types'

const { pickFolderMock } = vi.hoisted(() => ({ pickFolderMock: vi.fn() }))
vi.mock('../../lib/pickFolder', () => ({ pickFolder: pickFolderMock }))
vi.mock('../../api/repo.api', () => ({ apiOpenRepo: vi.fn(), apiInitRepo: vi.fn() }))
vi.mock('../../components/tab-bar/CloneRepoDialog', () => ({
  CloneRepoDialog: (props: { open: boolean }) =>
    props.open ? <div data-testid="clone-dialog" /> : null,
}))

import { apiOpenRepo, apiInitRepo } from '../../api/repo.api'
import { NewTabPage } from './NewTabPage'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore, DASHBOARD_TAB } from '../../stores/repoUI.store'

function repo(path: string, name: string): GitRepo {
  return { path, name, head: 'main', isDetached: false, isDirty: false, remotes: [] }
}

function saved(path: string, name: string) {
  return { path, name, pinned: false }
}

beforeEach(() => {
  useRepoUIStore.setState({ openTabs: [], activeTab: DASHBOARD_TAB, activeRepo: null })
  useRepoDataStore.setState({ savedRepos: [], recentRepoPaths: [] })
  localStorage.clear()
  pickFolderMock.mockReset()
  vi.mocked(apiOpenRepo).mockReset()
  vi.mocked(apiInitRepo).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NewTabPage', () => {
  it('renders the Repositories title and the three entry points', () => {
    render(<NewTabPage />)
    expect(screen.getByRole('heading', { name: 'Repositories' })).toBeInTheDocument()
    expect(screen.getByTestId('new-tab-open-button')).toHaveTextContent('Open')
    expect(screen.getByTestId('new-tab-clone-button')).toHaveTextContent('Clone')
    expect(screen.getByTestId('new-tab-create-button')).toHaveTextContent('Create')
  })

  it('lists recently opened repos, most recent first, with their paths', () => {
    useRepoDataStore.setState({
      savedRepos: [saved('/repo/a', 'alpha'), saved('/repo/b', 'beta')],
      recentRepoPaths: ['/repo/b', '/repo/a'],
    })
    render(<NewTabPage />)
    const rows = screen.getAllByTestId(/^new-tab-recent-repo-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'new-tab-recent-repo-/repo/b',
      'new-tab-recent-repo-/repo/a',
    ])
    expect(screen.getByText('/repo/a')).toBeInTheDocument()
  })

  it('tells the user when no repo has been opened yet', () => {
    render(<NewTabPage />)
    expect(screen.getByText('No repository opened yet.')).toBeInTheDocument()
  })

  it('opens a picked repo in place of this empty tab', async () => {
    const user = userEvent.setup()
    useRepoDataStore.setState({ savedRepos: [saved('/repo/a', 'alpha')] })
    useRepoUIStore.getState().openNewTab()
    const placeholder = useRepoUIStore.getState().activeTab

    render(<NewTabPage />)
    await user.click(screen.getByTestId('new-tab-recent-repo-/repo/a'))

    const state = useRepoUIStore.getState()
    expect(state.openTabs).toEqual(['/repo/a'])
    expect(state.activeTab).toBe('/repo/a')
    expect(state.openTabs).not.toContain(placeholder)
  })

  it('focuses the existing tab and closes this one when the repo is already open', async () => {
    const user = userEvent.setup()
    useRepoDataStore.setState({ savedRepos: [saved('/repo/a', 'alpha')] })
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().openNewTab()

    render(<NewTabPage />)
    expect(screen.getByTestId('new-tab-recent-repo-/repo/a')).toHaveTextContent('Open')
    await user.click(screen.getByTestId('new-tab-recent-repo-/repo/a'))

    const state = useRepoUIStore.getState()
    expect(state.openTabs).toEqual(['/repo/a'])
    expect(state.activeTab).toBe('/repo/a')
  })

  it('opens a folder through the picker and adds it as a tab', async () => {
    const user = userEvent.setup()
    pickFolderMock.mockResolvedValue('/repo/new')
    vi.mocked(apiOpenRepo).mockResolvedValue(repo('/repo/new', 'newbie'))

    render(<NewTabPage />)
    await user.click(screen.getByTestId('new-tab-open-button'))

    expect(apiOpenRepo).toHaveBeenCalledWith('/repo/new')
    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo/new'])
    expect(useRepoDataStore.getState().recentRepoPaths).toEqual(['/repo/new'])
  })

  it('initialises a new repo in the picked folder', async () => {
    const user = userEvent.setup()
    pickFolderMock.mockResolvedValue('/repo/fresh')
    vi.mocked(apiInitRepo).mockResolvedValue(repo('/repo/fresh', 'fresh'))

    render(<NewTabPage />)
    await user.click(screen.getByTestId('new-tab-create-button'))

    expect(apiInitRepo).toHaveBeenCalledWith('/repo/fresh')
    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo/fresh'])
  })

  it('surfaces a backend failure instead of failing silently', async () => {
    const user = userEvent.setup()
    pickFolderMock.mockResolvedValue('/repo/broken')
    vi.mocked(apiOpenRepo).mockRejectedValue(new Error('not a git repository'))

    render(<NewTabPage />)
    await user.click(screen.getByTestId('new-tab-open-button'))

    expect(await screen.findByText(/not a git repository/)).toBeInTheDocument()
    expect(useRepoUIStore.getState().openTabs).toEqual([])
  })

  it('opens the clone dialog from the Clone button', async () => {
    const user = userEvent.setup()
    render(<NewTabPage />)
    expect(screen.queryByTestId('clone-dialog')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('new-tab-clone-button'))
    expect(screen.getByTestId('clone-dialog')).toBeInTheDocument()
  })
})
