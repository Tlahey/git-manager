import type { GitHubAccount } from '@git-manager/git-types'
import { useSettingsStore } from '../stores/settings.store'

export interface GithubAccountState {
  /** The account selected in Settings › Integrations, or null when none is connected. */
  account: GitHubAccount | null
  token: string | null
  login: string | null
  /** True when a GitHub account is connected — the gate every GitHub-backed view reads. */
  isConnected: boolean
}

/**
 * The GitHub account the app is signed in as — one place instead of the
 * `accounts.find((a) => a.id === activeAccountId)` line every GitHub hook used to repeat.
 *
 * `isConnected` is what decides whether a view fetches **at all**, and that is the point of the
 * hook. A GitHub request made without a token does not merely return less: the search endpoints the
 * sidebar's saved filters use reject an anonymous caller outright, so a signed-out user was shown
 * the transport's own failure ("Load failed") where the true answer is "connect an account". Views
 * ask this first and render their sign-in state rather than firing a request that cannot succeed.
 */
export function useGithubAccount(): GithubAccountState {
  const github = useSettingsStore((s) => s.settings.github)
  const account = github?.accounts?.find((a) => a.id === github.activeAccountId) ?? null
  const token = account?.token || null
  return {
    account,
    token,
    login: account?.user?.login ?? null,
    isConnected: token !== null,
  }
}
