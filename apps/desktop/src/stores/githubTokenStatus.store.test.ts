import { beforeEach, describe, expect, it } from 'vitest'
import type { GithubApiResponse, GithubSsoChallenge } from '../lib/tauri'
import { useGithubTokenStatusStore } from './githubTokenStatus.store'
import { useSettingsStore } from './settings.store'

const CHALLENGE: GithubSsoChallenge = {
  required: true,
  organizations: [],
  authorizeUrl: 'https://github.com/orgs/acme/sso?authorization_request=abc',
}

function response(over: Partial<GithubApiResponse> = {}): GithubApiResponse {
  return { status: 200, ok: true, body: '{}', sso: null, tokenExpiresAt: null, ...over }
}

function connect(id: string, tokenExpiresAt: string | null = null) {
  const { settings, updateSettings } = useSettingsStore.getState()
  updateSettings({
    github: {
      accounts: [
        {
          id,
          user: { login: id, name: id, email: null, avatarUrl: '' },
          tokenExpiresAt,
        },
      ],
      activeAccountId: id,
    },
  })
  return settings
}

beforeEach(() => {
  useGithubTokenStatusStore.setState({ ssoByAccount: {} })
  useSettingsStore.getState().updateSettings({ github: { accounts: [], activeAccountId: null } })
})

describe('recordResponse — the SSO verdict', () => {
  it('says nothing about an account it has not heard from', () => {
    // Absent is not the same as "no challenge": the banner must not render a verdict either way.
    expect('octocat' in useGithubTokenStatusStore.getState().ssoByAccount).toBe(false)
  })

  it('records a refusal', () => {
    useGithubTokenStatusStore
      .getState()
      .recordResponse('octocat', response({ status: 403, ok: false, sso: CHALLENGE }))
    expect(useGithubTokenStatusStore.getState().ssoByAccount.octocat).toEqual(CHALLENGE)
  })

  it('clears itself on the next clean success, so the banner goes away once authorized', () => {
    const store = useGithubTokenStatusStore.getState()
    store.recordResponse('octocat', response({ status: 403, ok: false, sso: CHALLENGE }))
    store.recordResponse('octocat', response())
    expect(useGithubTokenStatusStore.getState().ssoByAccount.octocat).toBeNull()
  })

  it('leaves a standing challenge alone on an unrelated failure', () => {
    // A 404 from the releases endpoint means "no release for this tag" and says nothing about SSO.
    // Treating it as an all-clear would dismiss a banner that is still true.
    const store = useGithubTokenStatusStore.getState()
    store.recordResponse('octocat', response({ status: 403, ok: false, sso: CHALLENGE }))
    store.recordResponse('octocat', response({ status: 404, ok: false }))
    expect(useGithubTokenStatusStore.getState().ssoByAccount.octocat).toEqual(CHALLENGE)
  })

  it('ignores an anonymous request, which says nothing about any token', () => {
    useGithubTokenStatusStore.getState().recordResponse(null, response({ sso: CHALLENGE }))
    expect(useGithubTokenStatusStore.getState().ssoByAccount).toEqual({})
  })

  it('forgets an account, so a disconnected one cannot leave a banner behind', () => {
    const store = useGithubTokenStatusStore.getState()
    store.recordResponse('octocat', response({ status: 403, ok: false, sso: CHALLENGE }))
    store.forgetAccount('octocat')
    expect('octocat' in useGithubTokenStatusStore.getState().ssoByAccount).toBe(false)
  })
})

describe('recordResponse — the expiry date', () => {
  it('writes a freshly seen expiry onto the account', () => {
    connect('octocat')
    useGithubTokenStatusStore
      .getState()
      .recordResponse('octocat', response({ tokenExpiresAt: '2026-12-01T15:00:00+00:00' }))
    const accounts = useSettingsStore.getState().settings.github?.accounts
    expect(accounts?.[0]?.tokenExpiresAt).toBe('2026-12-01T15:00:00+00:00')
  })

  it('does not erase a known date when a response omits the header', () => {
    // An endpoint that answered without consulting the token is not evidence that the token stopped
    // expiring — this is what keeps a single anonymous-capable call from wiping the warning.
    connect('octocat', '2026-12-01T15:00:00+00:00')
    useGithubTokenStatusStore.getState().recordResponse('octocat', response())
    expect(useSettingsStore.getState().settings.github?.accounts[0]?.tokenExpiresAt).toBe(
      '2026-12-01T15:00:00+00:00'
    )
  })

  it('leaves the settings untouched when the date has not changed', () => {
    // Guarded because this runs on *every* GitHub response: an unconditional write would be a
    // debounced settings-file write per API call, for a value that changes once every 90 days.
    connect('octocat', '2026-12-01T15:00:00+00:00')
    const before = useSettingsStore.getState().settings.github
    useGithubTokenStatusStore
      .getState()
      .recordResponse('octocat', response({ tokenExpiresAt: '2026-12-01T15:00:00+00:00' }))
    expect(useSettingsStore.getState().settings.github).toBe(before)
  })

  it('ignores a date for an account that is not connected', () => {
    connect('octocat')
    useGithubTokenStatusStore
      .getState()
      .recordResponse('someone-else', response({ tokenExpiresAt: '2026-12-01T15:00:00+00:00' }))
    expect(useSettingsStore.getState().settings.github?.accounts[0]?.tokenExpiresAt).toBeNull()
  })
})
