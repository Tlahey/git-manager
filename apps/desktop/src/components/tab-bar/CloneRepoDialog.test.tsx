import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitRepo } from '@git-manager/git-types'

const dialogOpen = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...a: unknown[]) => dialogOpen(...a) }))
vi.mock('../../api/repo.api', () => ({ apiCloneRepo: vi.fn() }))

import { apiCloneRepo } from '../../api/repo.api'
import { CloneRepoDialog } from './CloneRepoDialog'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

const mockedClone = apiCloneRepo as unknown as ReturnType<typeof vi.fn>

function repo(overrides: Partial<GitRepo> = {}): GitRepo {
  return {
    path: '/dest/repo',
    name: 'repo',
    head: 'main',
    isDetached: false,
    isDirty: false,
    remotes: [],
    ...overrides,
  }
}

async function fillAndPickDir(
  user: ReturnType<typeof userEvent.setup>,
  url: string,
  parentDir = '/dest'
) {
  await user.type(screen.getByPlaceholderText('git@github.com:owner/repo.git'), url)
  dialogOpen.mockResolvedValue(parentDir)
  await user.click(screen.getByRole('button', { name: '' })) // the folder-picker icon button
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoDataStore.setState({ savedRepos: [], repoCache: {} })
  useRepoUIStore.setState({ openTabs: [], activeRepo: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CloneRepoDialog', () => {
  it('derives the destination folder name from a .git URL', async () => {
    const user = userEvent.setup()
    render(<CloneRepoDialog open onOpenChange={vi.fn()} />)
    await fillAndPickDir(user, 'git@github.com:owner/my-repo.git')
    expect(screen.getByText('Destination : /dest/my-repo')).toBeInTheDocument()
  })

  it('derives the folder name from a URL without a .git suffix or trailing slash', async () => {
    const user = userEvent.setup()
    render(<CloneRepoDialog open onOpenChange={vi.fn()} />)
    await fillAndPickDir(user, 'https://github.com/owner/my-repo/')
    expect(screen.getByText('Destination : /dest/my-repo')).toBeInTheDocument()
  })

  it('disables Clone until both a URL and a parent directory are set', async () => {
    const user = userEvent.setup()
    render(<CloneRepoDialog open onOpenChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: "Clone" })).toBeDisabled()
    await user.type(
      screen.getByPlaceholderText('git@github.com:owner/repo.git'),
      'git@github.com:owner/repo.git'
    )
    expect(screen.getByRole('button', { name: "Clone" })).toBeDisabled()
  })

  it('clones with the shallow/sparse flags and opens the resulting repo', async () => {
    mockedClone.mockResolvedValue(repo())
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<CloneRepoDialog open onOpenChange={onOpenChange} />)
    await fillAndPickDir(user, 'git@github.com:owner/repo.git')
    await user.click(screen.getByText('Shallow clone'))
    await user.click(screen.getByText('Sparse checkout'))
    await user.click(screen.getByRole('button', { name: "Clone" }))

    expect(mockedClone).toHaveBeenCalledWith(
      'git@github.com:owner/repo.git',
      '/dest/repo',
      true,
      true
    )
    expect(useRepoUIStore.getState().activeRepo).toBe('/dest/repo')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows an inline error and keeps the dialog open on failure', async () => {
    mockedClone.mockRejectedValue(new Error('clone failed'))
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<CloneRepoDialog open onOpenChange={onOpenChange} />)
    await fillAndPickDir(user, 'git@github.com:owner/repo.git')
    await user.click(screen.getByRole('button', { name: "Clone" }))

    expect(await screen.findByText(/clone failed/)).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('resets fields when cancelled', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<CloneRepoDialog open onOpenChange={onOpenChange} />)
    await user.type(
      screen.getByPlaceholderText('git@github.com:owner/repo.git'),
      'git@github.com:owner/repo.git'
    )
    await user.click(screen.getByRole('button', { name: "Cancel" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
