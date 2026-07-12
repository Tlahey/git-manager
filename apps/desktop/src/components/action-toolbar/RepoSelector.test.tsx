import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { RepoSelector } from './RepoSelector'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

beforeEach(() => {
  useRepoDataStore.setState({ savedRepos: [], repoCache: {} })
  useRepoUIStore.setState({ openTabs: [], activeRepo: null })
})

describe('RepoSelector — trigger label', () => {
  it('shows the "select a repo" placeholder when nothing is active', () => {
    render(<RepoSelector />)
    expect(screen.getByText('toolbar.selectRepo')).toBeInTheDocument()
  })

  it('shows the cached repo name for the active repo', () => {
    useRepoUIStore.setState({ activeRepo: '/repo/a' })
    useRepoDataStore.setState({
      repoCache: {
        '/repo/a': {
          path: '/repo/a',
          name: 'my-repo',
          head: 'main',
          isDetached: false,
          isDirty: false,
          remotes: [],
        },
      },
    })
    render(<RepoSelector />)
    expect(screen.getByText('my-repo')).toBeInTheDocument()
  })

  it('falls back to the last path segment when the repo is not yet cached', () => {
    useRepoUIStore.setState({ activeRepo: '/repo/uncached-name' })
    render(<RepoSelector />)
    expect(screen.getByText('uncached-name')).toBeInTheDocument()
  })
})

describe('RepoSelector — popover list', () => {
  beforeEach(() => {
    useRepoDataStore.setState({
      savedRepos: [
        { path: '/repo/a', name: 'alpha', pinned: false },
        { path: '/repo/b', name: 'beta', pinned: false },
      ],
      repoCache: {},
    })
  })

  it('lists every saved repo when opened', async () => {
    const user = userEvent.setup()
    render(<RepoSelector />)
    await user.click(screen.getByRole('button', { name: /toolbar.selectRepo/ }))
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
  })

  it('filters by name or path as the user types', async () => {
    const user = userEvent.setup()
    render(<RepoSelector />)
    await user.click(screen.getByRole('button', { name: /toolbar.selectRepo/ }))
    await user.type(screen.getByPlaceholderText('toolbar.searchRepo'), 'alph')
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.queryByText('beta')).not.toBeInTheDocument()
  })

  it('shows a "no repo" message when the filter matches nothing', async () => {
    const user = userEvent.setup()
    render(<RepoSelector />)
    await user.click(screen.getByRole('button', { name: /toolbar.selectRepo/ }))
    await user.type(screen.getByPlaceholderText('toolbar.searchRepo'), 'zzz')
    expect(screen.getByText('toolbar.noRepo')).toBeInTheDocument()
  })

  it('opens the clicked repo as a tab and closes the popover', async () => {
    const user = userEvent.setup()
    render(<RepoSelector />)
    await user.click(screen.getByRole('button', { name: /toolbar.selectRepo/ }))
    await user.click(screen.getByText('alpha'))

    expect(useRepoUIStore.getState().activeRepo).toBe('/repo/a')
    expect(useRepoUIStore.getState().openTabs).toContain('/repo/a')
    expect(screen.queryByPlaceholderText('toolbar.searchRepo')).not.toBeInTheDocument()
  })

  it('marks already-open tabs with an indicator dot', async () => {
    useRepoUIStore.setState({ openTabs: ['/repo/a'] })
    const user = userEvent.setup()
    render(<RepoSelector />)
    await user.click(screen.getByRole('button', { name: /toolbar.selectRepo/ }))
    const alphaButton = screen.getByText('alpha').closest('button')!
    expect(alphaButton.querySelector('.bg-primary')).not.toBeNull()
    const betaButton = screen.getByText('beta').closest('button')!
    expect(betaButton.querySelector('.bg-primary')).toBeNull()
  })
})
