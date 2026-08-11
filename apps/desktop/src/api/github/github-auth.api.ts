// Tauri backend GitHub integration wrappers
import {
  githubDeviceCode,
  githubPollToken,
  githubConnectToken,
  githubDisconnectAccount,
  githubListRepos,
  githubCommitAvatars,
} from '../../lib/tauri'

export async function apiGithubDeviceCode(scope: string) {
  return githubDeviceCode(scope)
}

export async function apiGithubPollToken(deviceCode: string) {
  return githubPollToken(deviceCode)
}

/**
 * Hands a personal access token to Rust, which validates it, stores it in the keychain and answers
 * with the account it belongs to. Nothing comes back that could be used to sign a request — that is
 * the point, and it is why this is a *connect* rather than the former `apiGithubGetUser(token)`.
 */
export async function apiGithubConnectToken(token: string) {
  return githubConnectToken(token)
}

/** Forgets an account's stored token, which is the half of "remove account" that lives in Rust. */
export async function apiGithubDisconnectAccount(accountId: string) {
  return githubDisconnectAccount(accountId)
}

export async function apiGithubListRepos(accountId: string) {
  return githubListRepos(accountId)
}

/** Resolves `sha → avatar URL` for the given commit SHAs (unresolved SHAs are absent). */
export async function apiGithubCommitAvatars(
  accountId: string,
  owner: string,
  repo: string,
  shas: string[]
): Promise<Record<string, string>> {
  return githubCommitAvatars(accountId, owner, repo, shas)
}
