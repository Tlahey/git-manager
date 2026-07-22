import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitRepo, GitHubAccount } from '@git-manager/git-types'

const { apiGetAppVersion } = vi.hoisted(() => ({ apiGetAppVersion: vi.fn() }))
vi.mock('../../api/updater.api', () => ({ apiGetAppVersion }))

import { Footer } from './Footer'
import { useRepoDataStore } from '../../stores/repoData.store'
import {
  useRepoUIStore,
  DASHBOARD_TAB,
  REWARDS_TAB,
  PULL_REQUESTS_TAB,
} from '../../stores/repoUI.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useGameStore } from '../../stores/game.store'

const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_REPO_UI = useRepoUIStore.getState()
const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_GAME = useGameStore.getState()

function repo(overrides: Partial<GitRepo> = {}): GitRepo {
  return {
    path: '/repo/a',
    name: 'repo-a',
    head: 'main',
    isDetached: false,
    isDirty: false,
    remotes: [],
    ...overrides,
  }
}

function account(overrides: Partial<GitHubAccount> = {}): GitHubAccount {
  return {
    id: 'acc1',
    token: 'tok',
    user: { login: 'antoine', name: 'Antoine', email: null, avatarUrl: '' },
    ...overrides,
  }
}

beforeEach(() => {
  apiGetAppVersion.mockResolvedValue('0.1.0')
  useRepoDataStore.setState({
    ...INITIAL_REPO_DATA,
    repoCache: {},
    savedRepos: [],
    discoveredRepos: [],
  })
  useRepoUIStore.setState({ ...INITIAL_REPO_UI, activeTab: DASHBOARD_TAB })
  useSettingsStore.setState(INITIAL_SETTINGS)
  useGameStore.setState({ ...INITIAL_GAME, points: 0, rewardsEnabled: true })
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Footer — contextual left section', () => {
  it('shows the dashboard state with the total repo count', () => {
    useRepoDataStore.setState({ savedRepos: [{ path: '/a', name: 'a', pinned: false }] })
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    expect(screen.getByText("Dashboard")).toBeInTheDocument()
    expect(screen.getByText("1 registered repo")).toBeInTheDocument()
  })

  it('uses the plural repo-count key once more than one repo is known', () => {
    useRepoDataStore.setState({
      savedRepos: [
        { path: '/a', name: 'a', pinned: false },
        { path: '/b', name: 'b', pinned: false },
      ],
    })
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    expect(screen.getByText("2 registered repos")).toBeInTheDocument()
  })

  it('deduplicates saved and discovered repos sharing the same path', () => {
    useRepoDataStore.setState({
      savedRepos: [{ path: '/a', name: 'a', pinned: false }],
      discoveredRepos: [
        { path: '/a', name: 'a' },
        { path: '/b', name: 'b' },
      ],
    })
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    expect(screen.getByText("2 registered repos")).toBeInTheDocument()
  })

  it('shows the launchpad state on the pull-requests tab', () => {
    useRepoUIStore.setState({ activeTab: PULL_REQUESTS_TAB })
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    expect(screen.getByText("Launchpad")).toBeInTheDocument()
  })

  it('shows the rewards state on the rewards tab', () => {
    useRepoUIStore.setState({ activeTab: REWARDS_TAB })
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    expect(screen.getByText('Succès & Récompenses')).toBeInTheDocument()
  })

  describe('on a repo tab', () => {
    beforeEach(() => {
      useRepoUIStore.setState({ activeTab: '/repo/a' })
    })

    it('shows the cached repo name and branch', () => {
      useRepoDataStore.setState({ repoCache: { '/repo/a': repo() } })
      render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
      expect(screen.getByText('repo-a')).toBeInTheDocument()
      expect(screen.getByText('main')).toBeInTheDocument()
    })

    it('falls back to the last path segment when the repo is not cached', () => {
      render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
      expect(screen.getByText('a')).toBeInTheDocument()
      expect(screen.getByText('...')).toBeInTheDocument() // no head known yet
    })

    it('shows the remotes when present', () => {
      useRepoDataStore.setState({
        repoCache: { '/repo/a': repo({ isDirty: true, remotes: ['origin', 'upstream'] }) },
      })
      render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
      expect(screen.getByText('origin, upstream')).toBeInTheDocument()
    })

    it('copies the repo path to the clipboard and shows a confirmation that reverts after 2s', async () => {
      useRepoDataStore.setState({ repoCache: { '/repo/a': repo() } })
      vi.useFakeTimers()
      render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)

      await act(async () => {
        fireEvent.click(screen.getByTitle("Click to copy the absolute path"))
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/repo/a')
      expect(screen.getByText("Repository path copied!")).toBeInTheDocument()

      await act(async () => vi.advanceTimersByTime(2000))
      expect(screen.queryByText("Repository path copied!")).not.toBeInTheDocument()
      vi.useRealTimers()
    })

    it('logs an error and does not show a confirmation when the clipboard write fails', async () => {
      useRepoDataStore.setState({ repoCache: { '/repo/a': repo() } })
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        configurable: true,
      })
      render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)

      await act(async () => {
        fireEvent.click(screen.getByTitle("Click to copy the absolute path"))
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(consoleError).toHaveBeenCalled()
      expect(screen.queryByText("Repository path copied!")).not.toBeInTheDocument()
    })
  })
})

describe('Footer — activity logs', () => {
  it('opens the activity logs view when the button is clicked', async () => {
    const onOpenActivityLogs = vi.fn()
    const user = userEvent.setup()
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={onOpenActivityLogs} />)
    await user.click(screen.getByTestId('footer-activity-logs-button'))
    expect(onOpenActivityLogs).toHaveBeenCalledOnce()
  })
})

describe('Footer — keyboard shortcuts dialog', () => {
  it('opens the dialog and lists shortcut categories on trigger click', async () => {
    const user = userEvent.setup()
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    await user.click(screen.getByTestId('footer-shortcuts-button'))
    expect(screen.getByText('Général')).toBeInTheDocument()
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Recherche')).toBeInTheDocument()
    expect(screen.getByText('Dépôt & Git')).toBeInTheDocument()
    expect(screen.getByText(/Aller à l.accueil/)).toBeInTheDocument()
    expect(screen.getByText('Ouvrir la palette de commandes')).toBeInTheDocument()
  })

  it('filters the list by description text as the user types', async () => {
    const user = userEvent.setup()
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    await user.click(screen.getByTestId('footer-shortcuts-button'))
    await user.type(screen.getByTestId('shortcuts-search-input'), 'palette')
    expect(screen.getByText('Ouvrir la palette de commandes')).toBeInTheDocument()
    expect(screen.queryByText('Navigation')).not.toBeInTheDocument()
    expect(screen.queryByText(/Aller à l.accueil/)).not.toBeInTheDocument()
  })

  it('filters the list by key text as the user types', async () => {
    const user = userEvent.setup()
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    await user.click(screen.getByTestId('footer-shortcuts-button'))
    await user.type(screen.getByTestId('shortcuts-search-input'), 'esc')
    expect(screen.getByText('Fermer les boîtes de dialogue / volets')).toBeInTheDocument()
    expect(screen.queryByText('Ouvrir la palette de commandes')).not.toBeInTheDocument()
  })

  it('shows an empty-state message when nothing matches the search', async () => {
    const user = userEvent.setup()
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    await user.click(screen.getByTestId('footer-shortcuts-button'))
    await user.type(screen.getByTestId('shortcuts-search-input'), 'zzzznomatch')
    expect(screen.getByText('Aucun raccourci ne correspond à « zzzznomatch ».')).toBeInTheDocument()
  })

  it('resets the search query after the dialog is closed and reopened', async () => {
    const user = userEvent.setup()
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    await user.click(screen.getByTestId('footer-shortcuts-button'))
    await user.type(screen.getByTestId('shortcuts-search-input'), 'palette')
    await user.keyboard('{Escape}')
    await user.click(screen.getByTestId('footer-shortcuts-button'))
    expect(screen.getByTestId('shortcuts-search-input')).toHaveValue('')
    expect(screen.getByText('Navigation')).toBeInTheDocument()
  })
})

describe('Footer — rewards link', () => {
  it('hides the rewards link when rewards are disabled', () => {
    useGameStore.setState({ rewardsEnabled: false })
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    expect(screen.queryByTitle('Consulter vos succès et récompenses Git')).not.toBeInTheDocument()
  })

  it('shows the current level and navigates to the rewards tab when clicked', async () => {
    useGameStore.setState({ points: 60 }) // level 2
    const user = userEvent.setup()
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    expect(screen.getByText('Niv. 2')).toBeInTheDocument()

    await user.click(screen.getByTitle('Consulter vos succès et récompenses Git'))
    expect(useRepoUIStore.getState().activeTab).toBe(REWARDS_TAB)
  })
})

describe('Footer — GitHub account link', () => {
  it('shows "not connected" when there is no active account', () => {
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    expect(screen.getByText("GitHub disconnected")).toBeInTheDocument()
  })

  it('shows the connected account name once a token is active', () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        github: { accounts: [account()], activeAccountId: 'acc1' },
      },
    })
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    expect(screen.getByText('Antoine')).toBeInTheDocument()
  })

  it('opens integrations settings when clicked', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<Footer onOpenSettings={onOpenSettings} onOpenActivityLogs={vi.fn()} />)
    await user.click(screen.getByText("GitHub disconnected").closest('button')!)
    expect(onOpenSettings).toHaveBeenCalledWith('integrations')
  })
})

describe('Footer — version', () => {
  it('shows the app version once read from Tauri', async () => {
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    expect(await screen.findByText("v0.1.0")).toBeInTheDocument()
  })

  it('does not render the version badge when the version cannot be read', () => {
    apiGetAppVersion.mockRejectedValue(new Error('not in tauri'))
    render(<Footer onOpenSettings={vi.fn()} onOpenActivityLogs={vi.fn()} />)
    expect(screen.queryByTestId('footer-version-button')).not.toBeInTheDocument()
  })

  it('opens the changelog settings section when clicked', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<Footer onOpenSettings={onOpenSettings} onOpenActivityLogs={vi.fn()} />)
    await user.click(await screen.findByTestId('footer-version-button'))
    expect(onOpenSettings).toHaveBeenCalledWith('changelog')
  })
})
