import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitHubAccount } from '@git-manager/git-types'
import { useSettingsStore } from '../stores/settings.store'
import { useGithubAccount } from './useGithubAccount'

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function account(id: string, login: string): GitHubAccount {
  return { id, user: { login, name: null, email: null, avatarUrl: '' } }
}

function setAccounts(accounts: GitHubAccount[], activeAccountId: string | null) {
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, github: { accounts, activeAccountId } },
  })
}

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
})

describe('useGithubAccount', () => {
  it('reports no connection when no account has been added', () => {
    const { result } = renderHook(() => useGithubAccount())
    expect(result.current).toMatchObject({
      account: null,
      accountId: null,
      login: null,
      isConnected: false,
    })
  })

  it('resolves the active account, not merely the first one', () => {
    setAccounts([account('a', 'alice'), account('b', 'bob')], 'b')
    const { result } = renderHook(() => useGithubAccount())
    expect(result.current.accountId).toBe('b')
    expect(result.current.login).toBe('bob')
    expect(result.current.isConnected).toBe(true)
  })

  // The store can hold accounts while pointing at none of them (the user removed the active one).
  it('reports no connection when the active id matches nothing', () => {
    setAccounts([account('a', 'alice')], null)
    const { result } = renderHook(() => useGithubAccount())
    expect(result.current.account).toBeNull()
    expect(result.current.isConnected).toBe(false)
  })

  // What every caller actually asks. The account id is the key its token is filed under in the
  // keychain, so a blank one names nothing and cannot sign a request — treating it as connected
  // would put the app straight back on the failing-request path.
  it('does not count an account with a blank id as connected', () => {
    setAccounts([account('', 'alice')], '')
    const { result } = renderHook(() => useGithubAccount())
    expect(result.current.accountId).toBeNull()
    expect(result.current.isConnected).toBe(false)
  })
})
