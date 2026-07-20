import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitRepo } from '@git-manager/git-types'

const dialogOpen = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...a: unknown[]) => dialogOpen(...a) }))
vi.mock('../../api/repo.api', () => ({ apiOpenRepo: vi.fn(), apiInitRepo: vi.fn() }))
vi.mock('./CloneRepoDialog', () => ({
  CloneRepoDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="clone-dialog" /> : null,
}))

import { apiOpenRepo, apiInitRepo } from '../../api/repo.api'
import { NewTabMenu } from './NewTabMenu'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

const mockedOpenRepo = apiOpenRepo as unknown as ReturnType<typeof vi.fn>
const mockedInitRepo = apiInitRepo as unknown as ReturnType<typeof vi.fn>

function repo(overrides: Partial<GitRepo> = {}): GitRepo {
  return {
    path: '/repo/a',
    name: 'a',
    head: 'main',
    isDetached: false,
    isDirty: false,
    remotes: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoDataStore.setState({ savedRepos: [], repoCache: {} })
  useRepoUIStore.setState({ openTabs: [], activeRepo: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NewTabMenu', () => {
  it('lists the three menu items', async () => {
    const user = userEvent.setup()
    render(<NewTabMenu />)
    await user.click(screen.getByTitle("New"))
    expect(screen.getByText("Open a folder")).toBeInTheDocument()
    expect(screen.getByText("Clone a repository")).toBeInTheDocument()
    expect(screen.getByText("Create a repository")).toBeInTheDocument()
  })

  it('opens a folder, adds and activates the repo', async () => {
    dialogOpen.mockResolvedValue('/repo/a')
    mockedOpenRepo.mockResolvedValue(repo())
    const user = userEvent.setup()
    render(<NewTabMenu />)
    await user.click(screen.getByTitle("New"))
    await user.click(screen.getByText("Open a folder"))

    expect(mockedOpenRepo).toHaveBeenCalledWith('/repo/a')
    expect(useRepoDataStore.getState().savedRepos.map((r) => r.path)).toContain('/repo/a')
    expect(useRepoUIStore.getState().activeRepo).toBe('/repo/a')
  })

  it('does nothing when the folder picker is cancelled', async () => {
    dialogOpen.mockResolvedValue(null)
    const user = userEvent.setup()
    render(<NewTabMenu />)
    await user.click(screen.getByTitle("New"))
    await user.click(screen.getByText("Open a folder"))
    expect(mockedOpenRepo).not.toHaveBeenCalled()
  })

  it('silently ignores a non-git folder', async () => {
    dialogOpen.mockResolvedValue('/not-a-repo')
    mockedOpenRepo.mockRejectedValue(new Error('not a git repo'))
    const user = userEvent.setup()
    render(<NewTabMenu />)
    await user.click(screen.getByTitle("New"))
    await expect(user.click(screen.getByText("Open a folder"))).resolves.toBeUndefined()
    expect(useRepoDataStore.getState().savedRepos).toEqual([])
  })

  it('creates a new repo and activates it', async () => {
    dialogOpen.mockResolvedValue('/repo/new')
    mockedInitRepo.mockResolvedValue(repo({ path: '/repo/new', name: 'new' }))
    const user = userEvent.setup()
    render(<NewTabMenu />)
    await user.click(screen.getByTitle("New"))
    await user.click(screen.getByText("Create a repository"))

    expect(mockedInitRepo).toHaveBeenCalledWith('/repo/new')
    expect(useRepoUIStore.getState().activeRepo).toBe('/repo/new')
  })

  it('opens the clone dialog', async () => {
    const user = userEvent.setup()
    render(<NewTabMenu />)
    await user.click(screen.getByTitle("New"))
    await user.click(screen.getByText("Clone a repository"))
    expect(screen.getByTestId('clone-dialog')).toBeInTheDocument()
  })
})
