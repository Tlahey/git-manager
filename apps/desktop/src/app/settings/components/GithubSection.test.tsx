import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitHubAccount } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { useGitHubRepos, useGithubDeviceFlow, lastDeviceFlowOptions } = vi.hoisted(() => ({
  useGitHubRepos: vi.fn(),
  useGithubDeviceFlow: vi.fn(),
  lastDeviceFlowOptions: { current: null as null | { onLoginSuccess: (token: string, user: unknown) => void } },
}))
vi.mock('../../../hooks/useGitHubRepos', () => ({ useGitHubRepos }))
vi.mock('../../../hooks/useGithubDeviceFlow', () => ({
  useGithubDeviceFlow: (opts: { onLoginSuccess: (token: string, user: unknown) => void }) => {
    lastDeviceFlowOptions.current = opts
    return useGithubDeviceFlow()
  },
}))

import { GithubSection } from './GithubSection'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

function deviceFlowState(overrides: Partial<ReturnType<typeof useGithubDeviceFlow>> = {}) {
  return {
    connecting: false,
    error: null,
    deviceFlowData: null,
    startOAuthLogin: vi.fn(),
    completeLoginWithToken: vi.fn(),
    cancelFlow: vi.fn(),
    ...overrides,
  }
}

function account(overrides: Partial<GitHubAccount> = {}): GitHubAccount {
  return { id: 'octocat', token: 'tok', user: { login: 'octocat', name: 'The Octocat', email: null, avatarUrl: 'https://x/avatar.png' }, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useGitHubRepos.mockReturnValue({ data: undefined, isLoading: false })
  useGithubDeviceFlow.mockReturnValue(deviceFlowState())
  lastDeviceFlowOptions.current = null
})

describe('GithubSection — initial login choice', () => {
  it('shows both OAuth and PAT login options by default', () => {
    render(<GithubSection />)
    expect(screen.getByText('settings.github.loginButton')).toBeInTheDocument()
    expect(screen.getByText('settings.github.loginWithPAT')).toBeInTheDocument()
  })

  it('starts the OAuth flow immediately when its button is clicked', async () => {
    const startOAuthLogin = vi.fn()
    useGithubDeviceFlow.mockReturnValue(deviceFlowState({ startOAuthLogin }))
    const user = userEvent.setup()
    render(<GithubSection />)
    await user.click(screen.getByText('settings.github.loginButton'))
    expect(startOAuthLogin).toHaveBeenCalledOnce()
  })
})

describe('GithubSection — PAT login', () => {
  it('opens the PAT form and submits the trimmed token', async () => {
    const completeLoginWithToken = vi.fn().mockResolvedValue(true)
    useGithubDeviceFlow.mockReturnValue(deviceFlowState({ completeLoginWithToken }))
    const user = userEvent.setup()
    render(<GithubSection />)
    await user.click(screen.getByText('settings.github.loginWithPAT'))
    await user.type(screen.getByPlaceholderText('settings.github.patPlaceholder'), '  ghp_abc123  ')
    await user.click(screen.getByText('settings.github.addPatButton'))

    expect(completeLoginWithToken).toHaveBeenCalledWith('ghp_abc123')
  })

  it('clears the form and returns to the choice screen on success', async () => {
    const completeLoginWithToken = vi.fn().mockResolvedValue(true)
    useGithubDeviceFlow.mockReturnValue(deviceFlowState({ completeLoginWithToken }))
    const user = userEvent.setup()
    render(<GithubSection />)
    await user.click(screen.getByText('settings.github.loginWithPAT'))
    await user.type(screen.getByPlaceholderText('settings.github.patPlaceholder'), 'ghp_abc123')
    await user.click(screen.getByText('settings.github.addPatButton'))

    expect(await screen.findByText('settings.github.loginButton')).toBeInTheDocument()
  })

  it('stays on the PAT form when the token is rejected', async () => {
    const completeLoginWithToken = vi.fn().mockResolvedValue(false)
    useGithubDeviceFlow.mockReturnValue(deviceFlowState({ completeLoginWithToken }))
    const user = userEvent.setup()
    render(<GithubSection />)
    await user.click(screen.getByText('settings.github.loginWithPAT'))
    await user.type(screen.getByPlaceholderText('settings.github.patPlaceholder'), 'bad-token')
    await user.click(screen.getByText('settings.github.addPatButton'))

    expect(await screen.findByPlaceholderText('settings.github.patPlaceholder')).toBeInTheDocument()
  })

  it('shows the error message from the device-flow hook', async () => {
    useGithubDeviceFlow.mockReturnValue(deviceFlowState({ error: 'invalid token' }))
    const user = userEvent.setup()
    render(<GithubSection />)
    await user.click(screen.getByText('settings.github.loginWithPAT'))
    expect(screen.getByText('invalid token')).toBeInTheDocument()
  })

  it('goes back to the choice screen via the back link', async () => {
    const cancelFlow = vi.fn()
    useGithubDeviceFlow.mockReturnValue(deviceFlowState({ cancelFlow }))
    const user = userEvent.setup()
    render(<GithubSection />)
    await user.click(screen.getByText('settings.github.loginWithPAT'))
    await user.click(screen.getByText('settings.github.backToAuthOptions'))
    expect(cancelFlow).toHaveBeenCalledOnce()
    expect(screen.getByText('settings.github.loginButton')).toBeInTheDocument()
  })
})

describe('GithubSection — device flow in progress', () => {
  it('shows the user code and verification link', () => {
    useGithubDeviceFlow.mockReturnValue(
      deviceFlowState({ deviceFlowData: { user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device' } as never })
    )
    render(<GithubSection />)
    expect(screen.getByText('ABCD-1234')).toBeInTheDocument()
    expect(screen.getByText('settings.github.openActivationPage').closest('a')).toHaveAttribute('href', 'https://github.com/login/device')
  })

  it('copies the user code and reverts the label after 2s', async () => {
    useGithubDeviceFlow.mockReturnValue(
      deviceFlowState({ deviceFlowData: { user_code: 'ABCD-1234', verification_uri: 'https://x' } as never })
    )
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn() }, configurable: true })
    vi.useFakeTimers()
    render(<GithubSection />)
    act(() => screen.getByText('settings.github.copyCode').click())
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABCD-1234')
    expect(screen.getByText('settings.github.codeCopied')).toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(2000))
    expect(screen.getByText('settings.github.copyCode')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('cancels the device flow', async () => {
    const cancelFlow = vi.fn()
    useGithubDeviceFlow.mockReturnValue(
      deviceFlowState({ deviceFlowData: { user_code: 'ABCD-1234', verification_uri: 'https://x' } as never, cancelFlow })
    )
    const user = userEvent.setup()
    render(<GithubSection />)
    await user.click(screen.getByText('settings.github.cancel'))
    expect(cancelFlow).toHaveBeenCalledOnce()
  })
})

describe('GithubSection — onLoginSuccess wiring', () => {
  it('adds the new account and makes it active', () => {
    render(<GithubSection />)
    act(() =>
      lastDeviceFlowOptions.current!.onLoginSuccess('new-token', { login: 'octocat', name: 'The Octocat', email: null, avatarUrl: 'a' })
    )
    const github = useSettingsStore.getState().settings.github!
    expect(github.accounts).toEqual([{ id: 'octocat', token: 'new-token', user: { login: 'octocat', name: 'The Octocat', email: null, avatarUrl: 'a' } }])
    expect(github.activeAccountId).toBe('octocat')
  })

  it('replaces an existing account with the same login rather than duplicating', () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, github: { accounts: [account({ token: 'old-token' })], activeAccountId: 'octocat' } },
    })
    render(<GithubSection />)
    act(() => lastDeviceFlowOptions.current!.onLoginSuccess('new-token', account().user))
    expect(useSettingsStore.getState().settings.github!.accounts).toHaveLength(1)
    expect(useSettingsStore.getState().settings.github!.accounts[0].token).toBe('new-token')
  })
})

describe('GithubSection — accounts list', () => {
  it('hides the accounts section when there are none', () => {
    render(<GithubSection />)
    expect(screen.queryByText('settings.github.accountsTitle')).not.toBeInTheDocument()
  })

  it('shows each account, badging the active one', () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        github: { accounts: [account({ id: 'a', user: { login: 'alice', name: 'Alice', email: null, avatarUrl: '' } }), account({ id: 'b', user: { login: 'bob', name: 'Bob', email: null, avatarUrl: '' } })], activeAccountId: 'a' },
      },
    })
    render(<GithubSection />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('settings.github.activeAccount')).toBeInTheDocument()
    expect(screen.getByText('settings.github.switch')).toBeInTheDocument() // only for the inactive one
  })

  it('switches the active account', async () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        github: { accounts: [account({ id: 'a' }), account({ id: 'b', user: { login: 'bob', name: 'Bob', email: null, avatarUrl: '' } })], activeAccountId: 'a' },
      },
    })
    const user = userEvent.setup()
    render(<GithubSection />)
    await user.click(screen.getByText('settings.github.switch'))
    expect(useSettingsStore.getState().settings.github!.activeAccountId).toBe('b')
  })

  it('removes an account and falls back to another remaining one if it was active', async () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        github: { accounts: [account({ id: 'a' }), account({ id: 'b', user: { login: 'bob', name: 'Bob', email: null, avatarUrl: '' } })], activeAccountId: 'a' },
      },
    })
    const user = userEvent.setup()
    render(<GithubSection />)
    await user.click(screen.getAllByText('settings.github.remove')[0])
    const github = useSettingsStore.getState().settings.github!
    expect(github.accounts.map((a) => a.id)).toEqual(['b'])
    expect(github.activeAccountId).toBe('b')
  })
})

describe('GithubSection — repositories panel', () => {
  it('shows a placeholder when there is no active account', () => {
    render(<GithubSection />)
    expect(screen.getByText('Connect an account or select one from the list to view its repositories.')).toBeInTheDocument()
  })

  it('shows a loading state while repos load', () => {
    useSettingsStore.setState({ settings: { ...INITIAL_SETTINGS.settings, github: { accounts: [account()], activeAccountId: 'octocat' } } })
    useGitHubRepos.mockReturnValue({ data: undefined, isLoading: true })
    render(<GithubSection />)
    expect(screen.getByText('Loading repositories...')).toBeInTheDocument()
  })

  it('shows an empty message when the account has no repos', () => {
    useSettingsStore.setState({ settings: { ...INITIAL_SETTINGS.settings, github: { accounts: [account()], activeAccountId: 'octocat' } } })
    useGitHubRepos.mockReturnValue({ data: [], isLoading: false })
    render(<GithubSection />)
    expect(screen.getByText('settings.github.noRepos')).toBeInTheDocument()
  })

  it('lists repos with visibility badge, description, and repo count', () => {
    useSettingsStore.setState({ settings: { ...INITIAL_SETTINGS.settings, github: { accounts: [account()], activeAccountId: 'octocat' } } })
    useGitHubRepos.mockReturnValue({
      data: [
        { id: 1, name: 'repo-a', fullName: 'octocat/repo-a', private: true, htmlUrl: 'https://github.com/octocat/repo-a', description: 'A repo', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 2, name: 'repo-b', fullName: 'octocat/repo-b', private: false, htmlUrl: 'https://github.com/octocat/repo-b', description: null, updatedAt: '2024-01-02T00:00:00Z' },
      ],
      isLoading: false,
    })
    render(<GithubSection />)
    expect(screen.getByText('repo-a')).toBeInTheDocument()
    expect(screen.getByText('Private')).toBeInTheDocument()
    expect(screen.getByText('A repo')).toBeInTheDocument()
    expect(screen.getByText('repo-b')).toBeInTheDocument()
    expect(screen.getByText('Public')).toBeInTheDocument()
    expect(screen.getByText('2 repos')).toBeInTheDocument()
  })
})
