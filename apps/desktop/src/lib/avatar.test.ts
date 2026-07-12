import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import type { AppSettings, GitHubAccount } from '@git-manager/git-types'

const getState = vi.fn()
vi.mock('../stores/settings.store', () => ({
  useSettingsStore: { getState: () => getState() },
}))

import { getAvatarUrl } from './avatar'

function account(overrides: Partial<GitHubAccount['user']> = {}): GitHubAccount {
  return {
    id: 'acc1',
    token: 'tok',
    user: {
      login: 'octocat',
      name: 'The Octocat',
      email: 'octo@example.com',
      avatarUrl: 'https://gh.example/avatar.png',
      ...overrides,
    },
  }
}

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    appearance: { showAvatars: true } as AppSettings['appearance'],
    github: { accounts: [], activeAccountId: null },
    ...overrides,
  } as AppSettings
}

beforeEach(() => {
  getState.mockReset()
})

describe('getAvatarUrl', () => {
  it('returns null when showAvatars is disabled', () => {
    getState.mockReturnValue({
      settings: settings({ appearance: { showAvatars: false } as AppSettings['appearance'] }),
    })
    expect(getAvatarUrl('a@b.com', 'Someone')).toBeNull()
  })

  it('matches a connected GitHub account by email (case-insensitive)', () => {
    const acc = account({ email: 'Octo@Example.com' })
    getState.mockReturnValue({
      settings: settings({ github: { accounts: [acc], activeAccountId: null } }),
    })
    expect(getAvatarUrl('octo@example.com', 'Someone Else')).toBe(acc.user.avatarUrl)
  })

  it('matches a connected GitHub account by login (case-insensitive)', () => {
    const acc = account()
    getState.mockReturnValue({
      settings: settings({ github: { accounts: [acc], activeAccountId: null } }),
    })
    expect(getAvatarUrl(undefined, 'OctoCat')).toBe(acc.user.avatarUrl)
  })

  it('matches a connected GitHub account by display name', () => {
    const acc = account()
    getState.mockReturnValue({
      settings: settings({ github: { accounts: [acc], activeAccountId: null } }),
    })
    expect(getAvatarUrl(undefined, 'the octocat')).toBe(acc.user.avatarUrl)
  })

  it('falls back to a Gravatar URL using an MD5 hash of the trimmed, lowercased email', () => {
    getState.mockReturnValue({ settings: settings() })
    const email = '  Test@Example.com  '
    const expectedHash = createHash('md5').update(email.trim().toLowerCase()).digest('hex')
    expect(getAvatarUrl(email, 'No Match')).toBe(
      `https://www.gravatar.com/avatar/${expectedHash}?d=identicon&s=64`
    )
  })

  it('returns null when there is no email and no matching account', () => {
    getState.mockReturnValue({ settings: settings() })
    expect(getAvatarUrl(undefined, 'Nobody')).toBeNull()
  })

  it('returns null for a blank email with no match', () => {
    getState.mockReturnValue({ settings: settings() })
    expect(getAvatarUrl('   ', undefined)).toBeNull()
  })

  it('prefers the GitHub account match over falling back to Gravatar', () => {
    const acc = account({ email: 'octo@example.com' })
    getState.mockReturnValue({
      settings: settings({ github: { accounts: [acc], activeAccountId: null } }),
    })
    expect(getAvatarUrl('octo@example.com', undefined)).toBe(acc.user.avatarUrl)
  })
})
