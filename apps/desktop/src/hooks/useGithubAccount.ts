import type { GitHubAccount } from '@git-manager/git-types'
import { useSettingsStore } from '../stores/settings.store'

export interface GithubAccountState {
  /** The account selected in Settings › Integrations, or null when none is connected. */
  account: GitHubAccount | null
  /**
   * Who to act as — the GitHub login, and the key Rust looks the token up under in the keychain.
   *
   * This is what every GitHub API call takes now, where it used to take the token itself. An account
   * id is not a secret: it is the login already shown in the UI, and the credential behind it never
   * enters the webview (see `lib/tauri/credentials.ts`).
   */
  accountId: string | null
  login: string | null
  /** True when a GitHub account is connected — the gate every GitHub-backed view reads. */
  isConnected: boolean
}

/**
 * The GitHub account the app is signed in as — one place instead of the
 * `accounts.find((a) => a.id === activeAccountId)` line every GitHub hook used to repeat.
 *
 * `isConnected` is what decides whether a view fetches **at all**, and that is the point of the
 * hook. A GitHub request made without an account does not merely return less: the search endpoints
 * the sidebar's saved filters use reject an anonymous caller outright, so a signed-out user was
 * shown the transport's own failure ("Load failed") where the true answer is "connect an account".
 * Views ask this first and render their sign-in state rather than firing a request that cannot
 * succeed.
 */
export function useGithubAccount(): GithubAccountState {
  const github = useSettingsStore((s) => s.settings.github)
  const account = github?.accounts?.find((a) => a.id === github.activeAccountId) ?? null
  // `||`, not `??`: an account with a blank id names nothing, so it cannot be looked up in the
  // keychain and cannot sign a request. Treating it as connected would put the app straight back on
  // the failing-request path this hook exists to keep it off.
  const accountId = account?.id || null
  return {
    account,
    accountId,
    login: account?.user?.login ?? null,
    isConnected: accountId !== null,
  }
}
