import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitRepo } from '@git-manager/git-types'

vi.mock('./NewTabMenu', () => ({ NewTabMenu: () => <div data-testid="new-tab-menu" /> }))
vi.mock('../action-toolbar/UserProfile', () => ({
  UserProfile: () => <div data-testid="user-profile" />,
}))
vi.mock('../notification/NotificationDropdown', () => ({
  NotificationDropdown: () => <div data-testid="notification-dropdown" />,
}))

import { TabBar } from './TabBar'
import {
  useRepoUIStore,
  DASHBOARD_TAB,
  REWARDS_TAB,
  PULL_REQUESTS_TAB,
} from '../../stores/repoUI.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useDevFixtureReposStore } from '../../stores/devFixtureRepos.store'
import { useGameStore } from '../../stores/game.store'

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

beforeEach(() => {
  useRepoUIStore.setState({ openTabs: [], activeTab: DASHBOARD_TAB, activeRepo: null })
  useRepoDataStore.setState({ repoCache: {} })
  useDevFixtureReposStore.setState({ fixtures: [] })
  useGameStore.setState({ rewardsEnabled: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TabBar — pinned tabs', () => {
  // Dashboard/Rewards use hideLabel=true: their text only exists in a non-interactive hover
  // tooltip <div> that's a *sibling* of the real <button>, not a descendant — so
  // screen.getByText(label).click() would hit the inert tooltip. Select the actual button by
  // its icon instead.
  function pinnedTabButton(container: HTMLElement, iconTestClass: string): HTMLElement {
    return container.querySelector(`.${iconTestClass}`)!.closest('button')!
  }

  it('activates the dashboard tab when clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(<TabBar onOpenSettings={vi.fn()} />)
    await user.click(pinnedTabButton(container, 'lucide-layout-dashboard'))
    expect(useRepoUIStore.getState().activeTab).toBe(DASHBOARD_TAB)
  })

  it('shows the rewards tab only when rewards are enabled', () => {
    useGameStore.setState({ rewardsEnabled: false })
    const { container } = render(<TabBar onOpenSettings={vi.fn()} />)
    expect(container.querySelector('.lucide-trophy')).not.toBeInTheDocument()
  })

  it('activates the launchpad (pull-requests) tab when clicked', async () => {
    const user = userEvent.setup()
    render(<TabBar onOpenSettings={vi.fn()} />)
    await user.click(screen.getByText('Launchpad'))
    expect(useRepoUIStore.getState().activeTab).toBe(PULL_REQUESTS_TAB)
  })

  it('activates the rewards tab when clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(<TabBar onOpenSettings={vi.fn()} />)
    await user.click(pinnedTabButton(container, 'lucide-trophy'))
    expect(useRepoUIStore.getState().activeTab).toBe(REWARDS_TAB)
  })
})

describe('TabBar — repo tabs', () => {
  beforeEach(() => {
    useRepoUIStore.setState({ openTabs: ['/repo/a', '/repo/b'], activeTab: '/repo/a' })
    useRepoDataStore.setState({
      repoCache: { '/repo/a': repo({ path: '/repo/a', name: 'repo-a' }) },
    })
  })

  it('shows the cached name, falling back to the last path segment', () => {
    render(<TabBar onOpenSettings={vi.fn()} />)
    expect(screen.getByText('repo-a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument() // /repo/b has no cache entry
  })

  it('activates a tab when clicked', async () => {
    const user = userEvent.setup()
    render(<TabBar onOpenSettings={vi.fn()} />)
    await user.click(screen.getByText('b'))
    expect(useRepoUIStore.getState().activeTab).toBe('/repo/b')
  })

  it('closes a tab via its close control without activating it first', async () => {
    const user = userEvent.setup()
    render(<TabBar onOpenSettings={vi.fn()} />)
    const closeControls = screen
      .getAllByRole('button', { hidden: true })
      .filter((el) => el.getAttribute('tabindex') === '-1')
    await user.click(closeControls[0])
    expect(useRepoUIStore.getState().openTabs).not.toContain('/repo/a')
  })

  it('reorders tabs via drag and drop', () => {
    render(<TabBar onOpenSettings={vi.fn()} />)
    const tabA = screen.getByText('repo-a').closest('button')!
    const tabB = screen.getByText('b').closest('button')!

    fireEvent.dragStart(tabA)
    fireEvent.dragOver(tabB)
    fireEvent.drop(tabB)

    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo/b', '/repo/a'])
  })
})

describe('TabBar — dev fixture tabs', () => {
  beforeEach(() => {
    useDevFixtureReposStore.setState({
      fixtures: [{ name: 'conflict', path: '/tmp/conflict', description: 'a rebase conflict' }],
    })
  })

  it('renders the fixture tab and activates it via setActiveRepo', async () => {
    const user = userEvent.setup()
    render(<TabBar onOpenSettings={vi.fn()} />)
    await user.click(screen.getByText('conflict'))
    expect(useRepoUIStore.getState().activeRepo).toBe('/tmp/conflict')
  })

  it('removes the fixture and falls back to the dashboard tab when closing the active one', async () => {
    useRepoUIStore.setState({ activeTab: '/tmp/conflict' })
    const user = userEvent.setup()
    render(<TabBar onOpenSettings={vi.fn()} />)
    const closeControls = screen
      .getAllByRole('button', { hidden: true })
      .filter((el) => el.getAttribute('tabindex') === '-1')
    await user.click(closeControls[0])

    expect(useDevFixtureReposStore.getState().fixtures).toEqual([])
    expect(useRepoUIStore.getState().activeTab).toBe(DASHBOARD_TAB)
  })
})

describe('TabBar — window chrome', () => {
  it('paints the top drag spacer with the chrome background (not the light content bg)', () => {
    // Twilight a11y regression: the drag spacer had no background, so the light
    // --background showed through as a white strip above the dark tab bar. It must
    // carry bg-sidebar like the tab bar beneath it.
    const { container } = render(<TabBar onOpenSettings={vi.fn()} />)
    const spacer = container.querySelector('[data-tauri-drag-region]') as HTMLElement
    expect(spacer).toBeTruthy()
    expect(spacer.style.height).toBe('var(--tab-bar-drag-spacer-height)')
    expect(spacer.className).toContain('bg-sidebar')
  })
})

describe('TabBar — settings/profile', () => {
  it('calls onOpenSettings("general") from the settings button', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<TabBar onOpenSettings={onOpenSettings} />)
    await user.click(screen.getByTitle('Réglages'))
    expect(onOpenSettings).toHaveBeenCalledWith('general')
  })

  it('renders the notification dropdown and user profile', () => {
    render(<TabBar onOpenSettings={vi.fn()} />)
    expect(screen.getByTestId('notification-dropdown')).toBeInTheDocument()
    expect(screen.getByTestId('user-profile')).toBeInTheDocument()
  })
})
