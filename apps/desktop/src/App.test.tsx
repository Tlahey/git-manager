import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('./lib/appEventBus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/appEventBus')>()
  return { ...actual, appEventBus: { ...actual.appEventBus, notify } }
})

const { listenCallbacks, unlisten } = vi.hoisted(() => ({
  listenCallbacks: new Map<string, (event: { payload: unknown }) => void>(),
  unlisten: vi.fn(),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, cb: (event: { payload: unknown }) => void) => {
    listenCallbacks.set(event, cb)
    return Promise.resolve(unlisten)
  }),
}))

const { swrMutate } = vi.hoisted(() => ({ swrMutate: vi.fn() }))
vi.mock('swr', () => ({ mutate: swrMutate }))

vi.mock('@git-manager/ui', () => ({ Toaster: () => <div data-testid="fake-toaster" /> }))

vi.mock('./app/dashboard/DashboardPage', () => ({
  DashboardPage: (props: { onOpenSettings: () => void }) => (
    <div data-testid="fake-dashboard-page">
      <button onClick={props.onOpenSettings}>dashboard-open-settings</button>
    </div>
  ),
}))
vi.mock('./app/pull-requests/components/RewardsTab', () => ({
  RewardsTab: () => <div data-testid="fake-rewards-tab" />,
}))
vi.mock('./app/repo/RepoView', () => ({ RepoView: () => <div data-testid="fake-repo-view" /> }))
vi.mock('./app/pull-requests/PullRequestsPage', () => ({
  PullRequestsPage: () => <div data-testid="fake-pr-page" />,
}))
vi.mock('./app/settings/SettingsPage', () => ({
  SettingsPage: (props: { initialSection: string; onClose: () => void }) => (
    <div data-testid="fake-settings-page">
      <span data-testid="settings-section">{props.initialSection}</span>
      <button onClick={props.onClose}>close-settings</button>
    </div>
  ),
}))
vi.mock('./components/tab-bar', () => ({
  TabBar: (props: { onOpenSettings: (section?: string) => void }) => (
    <div data-testid="fake-tab-bar">
      <button onClick={() => props.onOpenSettings()}>tabbar-open-settings</button>
    </div>
  ),
}))
vi.mock('./components/footer/Footer', () => ({
  Footer: (props: { onOpenSettings: (section?: string) => void }) => (
    <div data-testid="fake-footer">
      <button onClick={() => props.onOpenSettings('ssh')}>footer-open-ssh-settings</button>
    </div>
  ),
}))
vi.mock('./components/trophy/TrophyToast', () => ({ TrophyToast: () => <div data-testid="fake-trophy-toast" /> }))
vi.mock('./components/layout/OperationProgressBar', () => ({
  OperationProgressBar: () => <div data-testid="fake-operation-progress-bar" />,
}))

const { useKeyboardShortcuts } = vi.hoisted(() => ({ useKeyboardShortcuts: vi.fn() }))
vi.mock('./hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts }))
vi.mock('./hooks/useTheme', () => ({ useTheme: vi.fn() }))
vi.mock('./hooks/useMonacoTheme', () => ({ useMonacoTheme: vi.fn() }))
vi.mock('./hooks/useNotificationWatcher', () => ({ useNotificationWatcher: vi.fn() }))
vi.mock('./hooks/useDevFixtureImport', () => ({ useDevFixtureImport: vi.fn() }))

import App from './App'
import { useRepoUIStore, DASHBOARD_TAB, REWARDS_TAB, PULL_REQUESTS_TAB } from './stores/repoUI.store'
import { useOperationProgressStore } from './stores/operationProgress.store'
import { useUndoHistoryStore } from './stores/undoHistory.store'
import { useDebugLogStore } from './stores/debugLog.store'
import { queryClient } from './lib/queryClient'

const INITIAL_REPO_UI = useRepoUIStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  listenCallbacks.clear()
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  useOperationProgressStore.setState({ running: {} })
  useDebugLogStore.setState({ enabled: false, entries: [] })
  vi.spyOn(queryClient, 'invalidateQueries')
})

describe('App — tab-based page switching', () => {
  it('renders the DashboardPage on the dashboard tab', () => {
    useRepoUIStore.setState({ activeTab: DASHBOARD_TAB })
    render(<App />)
    expect(screen.getByTestId('fake-dashboard-page')).toBeInTheDocument()
  })

  it('renders the PullRequestsPage on the pull-requests tab', () => {
    useRepoUIStore.setState({ activeTab: PULL_REQUESTS_TAB })
    render(<App />)
    expect(screen.getByTestId('fake-pr-page')).toBeInTheDocument()
  })

  it('renders RewardsTab on the rewards tab', () => {
    useRepoUIStore.setState({ activeTab: REWARDS_TAB })
    render(<App />)
    expect(screen.getByTestId('fake-rewards-tab')).toBeInTheDocument()
  })

  it('renders RepoView for any other tab (an open repo path)', () => {
    useRepoUIStore.setState({ activeTab: '/some/repo/path' })
    render(<App />)
    expect(screen.getByTestId('fake-repo-view')).toBeInTheDocument()
  })
})

describe('App — settings overlay', () => {
  it('does not show settings by default', () => {
    render(<App />)
    expect(screen.queryByTestId('fake-settings-page')).not.toBeInTheDocument()
    expect(screen.getByTestId('fake-tab-bar')).toBeInTheDocument()
  })

  it('opens settings with the "general" section via the tab bar', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText('tabbar-open-settings'))
    expect(screen.getByTestId('fake-settings-page')).toBeInTheDocument()
    expect(screen.getByTestId('settings-section')).toHaveTextContent('general')
  })

  it('opens settings with a specific section via the Footer', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText('footer-open-ssh-settings'))
    expect(screen.getByTestId('settings-section')).toHaveTextContent('ssh')
  })

  it('opens settings with the "local_ai" section via the Dashboard', async () => {
    const user = userEvent.setup()
    useRepoUIStore.setState({ activeTab: DASHBOARD_TAB })
    render(<App />)
    await user.click(screen.getByText('dashboard-open-settings'))
    expect(screen.getByTestId('settings-section')).toHaveTextContent('local_ai')
  })

  it('closes settings and shows the normal layout again', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText('tabbar-open-settings'))
    await user.click(screen.getByText('close-settings'))
    expect(screen.queryByTestId('fake-settings-page')).not.toBeInTheDocument()
    expect(screen.getByTestId('fake-tab-bar')).toBeInTheDocument()
  })

  it('hides TabBar/OperationProgressBar/Footer/page content while settings are open, but keeps toasts', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText('tabbar-open-settings'))
    expect(screen.queryByTestId('fake-tab-bar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('fake-operation-progress-bar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('fake-footer')).not.toBeInTheDocument()
    expect(screen.getByTestId('fake-trophy-toast')).toBeInTheDocument()
    expect(screen.getByTestId('fake-toaster')).toBeInTheDocument()
  })
})

describe('App — keyboard shortcuts wiring', () => {
  it('passes showSettings=false and toggles it via onOpenSettings/onCloseSettings', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(useKeyboardShortcuts).toHaveBeenLastCalledWith(
      expect.objectContaining({ showSettings: false })
    )
    const { onOpenSettings } = useKeyboardShortcuts.mock.calls[0][0]
    act(() => onOpenSettings())
    expect(screen.getByTestId('fake-settings-page')).toBeInTheDocument()

    await user.click(screen.getByText('close-settings'))
    expect(useKeyboardShortcuts).toHaveBeenLastCalledWith(
      expect.objectContaining({ showSettings: false })
    )
  })
})

describe('App — lifecycle event', () => {
  it('notifies "open_app" once on mount', () => {
    render(<App />)
    expect(notify).toHaveBeenCalledWith('open_app')
    expect(notify).toHaveBeenCalledTimes(1)
  })
})

describe('App — Tauri event listeners', () => {
  it('invalidates rebase/status/log queries and mutates conflicted-files on conflict-resolved', async () => {
    render(<App />)
    await act(async () => {
      listenCallbacks.get('conflict-resolved')?.({ payload: { repoPath: '/repo', filePath: 'a.ts' } })
    })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['rebase-state', '/repo'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
    expect(swrMutate).toHaveBeenCalledWith(['conflicted-files', '/repo'])
  })

  it('invalidates status/log/pending-fixups queries and rehydrates undo history on fixup-committed', async () => {
    const rehydrate = vi.spyOn(useUndoHistoryStore.persist, 'rehydrate').mockResolvedValue()
    render(<App />)
    await act(async () => {
      listenCallbacks.get('fixup-committed')?.({ payload: { repoPath: '/repo' } })
    })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['pending-fixups', '/repo'] })
    // Fixup/rebasing windows persist their undo entry to localStorage; the main window must
    // re-read it so the UNDO button reflects the action performed in that other window.
    expect(rehydrate).toHaveBeenCalled()
  })

  it('appends broadcast IPC calls to the debug log on debug-log-entry', async () => {
    render(<App />)
    await act(async () => {
      listenCallbacks.get('debug-log-entry')?.({
        payload: { command: 'create_fixup_commit', args: { path: '/repo' }, durationMs: 5, status: 'ok' },
      })
    })
    const [logged] = useDebugLogStore.getState().entries
    expect(logged).toMatchObject({ command: 'create_fixup_commit', status: 'ok' })
  })

  it('starts the progress bar on rebase-progress "start"', async () => {
    render(<App />)
    await act(async () => {
      listenCallbacks.get('rebase-progress')?.({ payload: { repoPath: '/repo', phase: 'start' } })
    })
    expect(useOperationProgressStore.getState().running['/repo']).toBe('rebase')
  })

  it('clears the progress bar and invalidates queries on rebase-progress completion', async () => {
    render(<App />)
    await act(async () => {
      listenCallbacks.get('rebase-progress')?.({ payload: { repoPath: '/repo', phase: 'start' } })
    })
    await act(async () => {
      listenCallbacks.get('rebase-progress')?.({ payload: { repoPath: '/repo', phase: 'end' } })
    })
    expect(useOperationProgressStore.getState().running['/repo']).toBeUndefined()
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['rebase-state', '/repo'] })
    expect(swrMutate).toHaveBeenCalledWith(['conflicted-files', '/repo'])
  })
})
