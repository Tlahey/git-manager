import { create } from 'zustand'
import type { GithubApiResponse, GithubSsoChallenge } from '../lib/tauri'
import { useSettingsStore } from './settings.store'

/**
 * What GitHub last said about each connected account's token, learned from the responses themselves.
 *
 * Fed by `api/github/githubApiShared.ts` — the single funnel every GitHub call goes through — from
 * the two headers Rust surfaces on `GithubApiResponse` (see
 * `src-tauri/src/services/github_token_status.rs`, which explains why they are read per response
 * rather than once at connect time).
 *
 * # Deliberately not persisted
 *
 * The SSO verdict is a fact about *right now*: an organization can enable SAML, or an owner can
 * revoke a token's authorization, between two launches. Persisting it would mean starting up with a
 * banner nobody can dismiss because the condition it names is gone — or, worse, without one while
 * every request 403s. Held in memory, it is simply re-learned by the first request after launch.
 *
 * The expiry date is the opposite case and lives elsewhere: it is a stable property of the token, so
 * it is written onto the account in `settings.json` (`GitHubAccount.tokenExpiresAt`) and the warning
 * can be shown at launch without waiting for a call.
 */
interface GithubTokenStatusState {
  /**
   * Account id → the SSO challenge last seen, or `null` once a request succeeded without one.
   *
   * An account absent from the map has simply not been heard from yet, which is not the same as
   * "no challenge" and must not render as a verdict either way.
   */
  ssoByAccount: Record<string, GithubSsoChallenge | null>
  /** Records one response's verdict. Anonymous requests say nothing about a token and are ignored. */
  recordResponse: (accountId: string | null | undefined, res: GithubApiResponse) => void
  /** Forgets an account — called when it is disconnected, so a stale banner cannot outlive it. */
  forgetAccount: (accountId: string) => void
}

/**
 * Writes a freshly-seen expiry onto the account, if it actually changed.
 *
 * Guarded by the comparison because this runs on every GitHub response: an unconditional write would
 * be a debounced settings-file write per API call, for a value that changes once every 90 days.
 */
function syncExpiry(accountId: string, expiresAt: string | null) {
  const { settings, updateSettings } = useSettingsStore.getState()
  const github = settings.github
  if (!github) return

  const account = github.accounts.find((a) => a.id === accountId)
  // `?? null` on both sides so "absent" and "null" compare equal — an account connected before this
  // field existed has neither, and must not be rewritten on every response for the difference.
  if (!account || (account.tokenExpiresAt ?? null) === expiresAt) return

  updateSettings({
    github: {
      ...github,
      accounts: github.accounts.map((a) =>
        a.id === accountId ? { ...a, tokenExpiresAt: expiresAt } : a
      ),
    },
  })
}

export const useGithubTokenStatusStore = create<GithubTokenStatusState>()((set) => ({
  ssoByAccount: {},

  recordResponse: (accountId, res) => {
    if (!accountId) return

    // Any challenge is recorded — both the refusal and the quieter "partial-results", which is a
    // 200 that dropped an organization's data. A *clean* success clears the account, which is what
    // makes the banner disappear on its own once the user has authorized the token. Any other
    // failure is left alone: a 404 on a missing release says nothing about SSO, and treating it as
    // "all clear" would dismiss a banner that is still true.
    if (res.sso) {
      const challenge = res.sso
      set((state) => ({ ssoByAccount: { ...state.ssoByAccount, [accountId]: challenge } }))
    } else if (res.ok) {
      set((state) =>
        accountId in state.ssoByAccount && state.ssoByAccount[accountId] === null
          ? state
          : { ssoByAccount: { ...state.ssoByAccount, [accountId]: null } }
      )
    }

    // Only when GitHub declared one: a response that omits the header (an anonymous-capable
    // endpoint, an error raised before the token was consulted) is not evidence that the token
    // stopped expiring, and must not erase a date the app already knows.
    if (res.tokenExpiresAt) syncExpiry(accountId, res.tokenExpiresAt)
  },

  forgetAccount: (accountId) =>
    set((state) => {
      if (!(accountId in state.ssoByAccount)) return state
      const next = { ...state.ssoByAccount }
      delete next[accountId]
      return { ssoByAccount: next }
    }),
}))
