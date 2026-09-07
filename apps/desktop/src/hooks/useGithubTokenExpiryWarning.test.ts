import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGithubTokenExpiryWarning } from './useGithubTokenExpiryWarning'
import { useSettingsStore } from '../stores/settings.store'

const warning = vi.hoisted(() => vi.fn())
vi.mock('@git-manager/ui', () => ({ toast: { warning } }))

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

function connect(accounts: Array<{ id: string; tokenExpiresAt: string | null }>) {
  useSettingsStore.getState().updateSettings({
    github: {
      accounts: accounts.map(({ id, tokenExpiresAt }) => ({
        id,
        user: { login: id, name: id, email: null, avatarUrl: '' },
        tokenExpiresAt,
      })),
      activeAccountId: accounts[0]?.id ?? null,
    },
  })
}

beforeEach(() => {
  warning.mockClear()
  useSettingsStore.getState().updateSettings({ github: { accounts: [], activeAccountId: null } })
})

describe('useGithubTokenExpiryWarning', () => {
  it('stays quiet for a token with months left', () => {
    connect([{ id: 'octocat', tokenExpiresAt: inDays(60) }])
    renderHook(() => useGithubTokenExpiryWarning())
    expect(warning).not.toHaveBeenCalled()
  })

  it('stays quiet for a token that never expires', () => {
    // The legitimate configuration this must not nag about: a classic token with no expiry date.
    connect([{ id: 'octocat', tokenExpiresAt: null }])
    renderHook(() => useGithubTokenExpiryWarning())
    expect(warning).not.toHaveBeenCalled()
  })

  it('warns inside the seven-day window, naming the account and the deadline', () => {
    connect([{ id: 'octocat', tokenExpiresAt: inDays(3) }])
    renderHook(() => useGithubTokenExpiryWarning())

    expect(warning).toHaveBeenCalledTimes(1)
    const [title, options] = warning.mock.calls[0] as [string, { description: string }]
    expect(title).toBe('GitHub token')
    expect(options.description).toContain('@octocat')
    expect(options.description).toContain('3 days')
  })

  it('warns about a token that has already expired', () => {
    connect([{ id: 'octocat', tokenExpiresAt: inDays(-1) }])
    renderHook(() => useGithubTokenExpiryWarning())
    expect(warning).toHaveBeenCalledTimes(1)
    expect((warning.mock.calls[0]![1] as { description: string }).description).toContain('expired')
  })

  it('warns once per account, not once per render', () => {
    connect([{ id: 'octocat', tokenExpiresAt: inDays(3) }])
    const { rerender } = renderHook(() => useGithubTokenExpiryWarning())
    rerender()
    rerender()
    expect(warning).toHaveBeenCalledTimes(1)
  })

  it('warns separately for each expiring account', () => {
    connect([
      { id: 'octocat', tokenExpiresAt: inDays(2) },
      { id: 'hubot', tokenExpiresAt: inDays(60) },
      { id: 'monalisa', tokenExpiresAt: inDays(-3) },
    ])
    renderHook(() => useGithubTokenExpiryWarning())
    expect(warning).toHaveBeenCalledTimes(2)
  })
})
