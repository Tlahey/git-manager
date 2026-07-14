import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitRepo, GitHubAccount } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

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
import { useUpdaterStore } from '../../stores/updater.store'

const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_REPO_UI = useRepoUIStore.getState()
const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_GAME = useGameStore.getState()
const INITIAL_UPDATER = useUpdaterStore.getState()

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
  useRepoDataStore.setState({
    ...INITIAL_REPO_DATA,
    repoCache: {},
    savedRepos: [],
    discoveredRepos: [],
  })
  useRepoUIStore.setState({ ...INITIAL_REPO_UI, activeTab: DASHBOARD_TAB })
  useSettingsStore.setState(INITIAL_SETTINGS)
  useGameStore.setState({ ...INITIAL_GAME, points: 0, rewardsEnabled: true })
  useUpdaterStore.setState({ ...INITIAL_UPDATER, status: 'idle', currentVersion: '0.1.0' })
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
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.getByText('footer.dashboard')).toBeInTheDocument()
    expect(screen.getByText('footer.totalRepos:{"count":1}')).toBeInTheDocument()
  })

  it('uses the plural repo-count key once more than one repo is known', () => {
    useRepoDataStore.setState({
      savedRepos: [
        { path: '/a', name: 'a', pinned: false },
        { path: '/b', name: 'b', pinned: false },
      ],
    })
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.getByText('footer.totalRepos_plural:{"count":2}')).toBeInTheDocument()
  })

  it('deduplicates saved and discovered repos sharing the same path', () => {
    useRepoDataStore.setState({
      savedRepos: [{ path: '/a', name: 'a', pinned: false }],
      discoveredRepos: [
        { path: '/a', name: 'a' },
        { path: '/b', name: 'b' },
      ],
    })
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.getByText('footer.totalRepos_plural:{"count":2}')).toBeInTheDocument()
  })

  it('shows the launchpad state on the pull-requests tab', () => {
    useRepoUIStore.setState({ activeTab: PULL_REQUESTS_TAB })
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.getByText('footer.launchpad')).toBeInTheDocument()
  })

  it('shows the rewards state on the rewards tab', () => {
    useRepoUIStore.setState({ activeTab: REWARDS_TAB })
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.getByText('Succès & Récompenses')).toBeInTheDocument()
  })

  describe('on a repo tab', () => {
    beforeEach(() => {
      useRepoUIStore.setState({ activeTab: '/repo/a' })
    })

    it('shows the cached repo name, branch, and clean status', () => {
      useRepoDataStore.setState({ repoCache: { '/repo/a': repo() } })
      render(<Footer onOpenSettings={vi.fn()} />)
      expect(screen.getByText('repo-a')).toBeInTheDocument()
      expect(screen.getByText('main')).toBeInTheDocument()
      expect(screen.getByText('footer.clean')).toBeInTheDocument()
    })

    it('falls back to the last path segment when the repo is not cached', () => {
      render(<Footer onOpenSettings={vi.fn()} />)
      expect(screen.getByText('a')).toBeInTheDocument()
      expect(screen.getByText('...')).toBeInTheDocument() // no head known yet
    })

    it('shows the dirty status and remotes when present', () => {
      useRepoDataStore.setState({
        repoCache: { '/repo/a': repo({ isDirty: true, remotes: ['origin', 'upstream'] }) },
      })
      render(<Footer onOpenSettings={vi.fn()} />)
      expect(screen.getByText('footer.dirty')).toBeInTheDocument()
      expect(screen.getByText('origin, upstream')).toBeInTheDocument()
    })

    it('copies the repo path to the clipboard and shows a confirmation that reverts after 2s', async () => {
      useRepoDataStore.setState({ repoCache: { '/repo/a': repo() } })
      vi.useFakeTimers()
      render(<Footer onOpenSettings={vi.fn()} />)

      await act(async () => {
        fireEvent.click(screen.getByTitle('Cliquer pour copier le chemin absolu'))
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/repo/a')
      expect(screen.getByText('footer.copiedPath')).toBeInTheDocument()

      await act(async () => vi.advanceTimersByTime(2000))
      expect(screen.queryByText('footer.copiedPath')).not.toBeInTheDocument()
      vi.useRealTimers()
    })

    it('logs an error and does not show a confirmation when the clipboard write fails', async () => {
      useRepoDataStore.setState({ repoCache: { '/repo/a': repo() } })
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        configurable: true,
      })
      render(<Footer onOpenSettings={vi.fn()} />)

      await act(async () => {
        fireEvent.click(screen.getByTitle('Cliquer pour copier le chemin absolu'))
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(consoleError).toHaveBeenCalled()
      expect(screen.queryByText('footer.copiedPath')).not.toBeInTheDocument()
    })
  })
})

describe('Footer — keyboard shortcuts dialog', () => {
  it('opens the dialog and lists shortcut categories on trigger click', async () => {
    const user = userEvent.setup()
    render(<Footer onOpenSettings={vi.fn()} />)
    await user.click(screen.getByText('footer.keyboardShortcuts'))
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Dépôts & Actions')).toBeInTheDocument()
    expect(screen.getByText(/Aller à l.accueil/)).toBeInTheDocument()
  })
})

describe('Footer — rewards link', () => {
  it('hides the rewards link when rewards are disabled', () => {
    useGameStore.setState({ rewardsEnabled: false })
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.queryByTitle('Consulter vos succès et récompenses Git')).not.toBeInTheDocument()
  })

  it('shows the current level and navigates to the rewards tab when clicked', async () => {
    useGameStore.setState({ points: 60 }) // level 2
    const user = userEvent.setup()
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.getByText('Niv. 2')).toBeInTheDocument()

    await user.click(screen.getByTitle('Consulter vos succès et récompenses Git'))
    expect(useRepoUIStore.getState().activeTab).toBe(REWARDS_TAB)
  })
})

describe('Footer — GitHub account link', () => {
  it('shows "not connected" when there is no active account', () => {
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.getByText('footer.notConnected')).toBeInTheDocument()
  })

  it('shows the connected account name once a token is active', () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        github: { accounts: [account()], activeAccountId: 'acc1' },
      },
    })
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.getByText('Antoine')).toBeInTheDocument()
  })

  it('opens integrations settings when clicked', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<Footer onOpenSettings={onOpenSettings} />)
    await user.click(screen.getByText('footer.notConnected').closest('button')!)
    expect(onOpenSettings).toHaveBeenCalledWith('integrations')
  })
})

describe('Footer — version', () => {
  it('shows the app version once known', () => {
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.getByText('footer.version:{"version":"0.1.0"}')).toBeInTheDocument()
  })

  it('shows no version badge before it has been resolved', () => {
    useUpdaterStore.setState({ currentVersion: null })
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.queryByText(/footer\.version/)).not.toBeInTheDocument()
  })
})

describe('Footer — update badge', () => {
  it('is hidden when no update is available', () => {
    render(<Footer onOpenSettings={vi.fn()} />)
    expect(screen.queryByTestId('footer-update-badge')).not.toBeInTheDocument()
  })

  it.each(['available', 'downloading', 'ready'] as const)(
    'shows the badge when status is "%s"',
    (status) => {
      useUpdaterStore.setState({ status, availableVersion: '1.2.0' })
      render(<Footer onOpenSettings={vi.fn()} />)
      expect(screen.getByTestId('footer-update-badge')).toHaveTextContent(
        'footer.updateAvailable:{"version":"1.2.0"}'
      )
    }
  )

  it('opens Settings → General when clicked', async () => {
    useUpdaterStore.setState({ status: 'available', availableVersion: '1.2.0' })
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<Footer onOpenSettings={onOpenSettings} />)
    await user.click(screen.getByTestId('footer-update-badge'))
    expect(onOpenSettings).toHaveBeenCalledWith('general')
  })
})
