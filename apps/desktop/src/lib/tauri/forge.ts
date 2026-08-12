import { invoke } from './invoke'
import type { PrTemplateDetection } from '@git-manager/git-types'

// ─── GitHub OAuth ─────────────────────────────────────────────────────────────

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

/**
 * The device flow's answer. Carries the *account*, never the token behind it: an authorized poll is
 * completed inside Rust, which stores the credential in the keychain and reports who signed in.
 * There is no field here a caller could read a secret out of, and that is the point — see
 * `src-tauri/src/services/credential_store.rs`.
 */
export interface PollTokenResponse {
  user: GitHubUserInfo | null
  error: string | null
  error_description: string | null
}

/** GitLab's poll, which still hands its access token back for the caller to store. */
export interface GitLabPollTokenResponse {
  access_token: string | null
  error: string | null
  error_description: string | null
}

export interface GitHubUserInfo {
  login: string
  name: string | null
  email: string | null
  avatarUrl: string
}

export const githubDeviceCode = (scope: string) =>
  invoke<DeviceCodeResponse>('github_device_code', { scope })

export const githubPollToken = (deviceCode: string) =>
  invoke<PollTokenResponse>('github_poll_token', { deviceCode })

/**
 * Validates a personal access token, stores it in the keychain and returns the account it belongs
 * to. The token's one and only trip through the webview: the user pastes it, this sends it to Rust,
 * and nothing hands it back.
 */
export const githubConnectToken = (token: string) =>
  invoke<GitHubUserInfo>('github_connect_token', { token })

/** Forgets an account's stored token — the half of "remove account" the frontend cannot reach. */
export const githubDisconnectAccount = (accountId: string) =>
  invoke<void>('github_disconnect_account', { accountId })

/** One GitHub API response, as {@link githubApiRequest} returns it. */
export interface GithubApiResponse {
  status: number
  ok: boolean
  /** The raw body. Not parsed here: the contents API's `raw` media type returns file text. */
  body: string
}

/**
 * Performs one GitHub API call through Rust, which attaches `accountId`'s token from the keychain.
 *
 * The only way the app reaches api.github.com. `fetch` must not be used for GitHub from the webview
 * — it cannot be, now: the token is not here to attach. Rust also refuses any URL outside
 * `https://api.github.com/`, so this cannot be turned into a way to post a credential elsewhere.
 */
export const githubApiRequest = (input: {
  accountId?: string | null
  url: string
  method?: string
  body?: unknown
  accept?: string
}) =>
  invoke<GithubApiResponse>('github_api_request', {
    accountId: input.accountId ?? null,
    url: input.url,
    method: input.method ?? 'GET',
    body: input.body ?? null,
    accept: input.accept ?? null,
  })

// ─── GitLab OAuth (device flow) ───────────────────────────────────────────────
//
// Same shape as GitHub's above, plus the two things GitLab needs and GitHub does not: the
// *instance* (gitlab.com or a self-hosted server) and, for a self-hosted one, its own client id —
// every instance keeps a separate application registry, so the shipped gitlab.com id means nothing
// there. Passing `null` uses the shipped one.

export interface GitLabDeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  /** `verification_uri` with the code already filled in — GitLab provides this, GitHub does not. */
  verification_uri_complete: string | null
  expires_in: number
  interval: number
}

export interface GitLabUserInfo {
  username: string
  name: string | null
  email: string | null
  avatarUrl: string | null
}

export const gitlabDeviceCode = (instanceUrl: string, clientId: string | null, scope: string) =>
  invoke<GitLabDeviceCodeResponse>('gitlab_device_code', { instanceUrl, clientId, scope })

export const gitlabPollToken = (instanceUrl: string, clientId: string | null, deviceCode: string) =>
  invoke<GitLabPollTokenResponse>('gitlab_poll_token', { instanceUrl, clientId, deviceCode })

export const gitlabGetUser = (instanceUrl: string, token: string) =>
  invoke<GitLabUserInfo>('gitlab_get_user', { instanceUrl, token })

// ─── Bitbucket (token, validated) ─────────────────────────────────────────────

export interface BitbucketUserInfo {
  accountId: string
  displayName: string
  nickname: string | null
  avatarUrl: string | null
}

/** Verifies an app password / API token by asking Bitbucket who it belongs to. */
export const bitbucketGetUser = (username: string, token: string) =>
  invoke<BitbucketUserInfo>('bitbucket_get_user', { username, token })

export interface GitHubRepoInfo {
  id: number
  name: string
  fullName: string
  private: boolean
  htmlUrl: string
  description: string | null
  updatedAt: string
}

export const githubListRepos = (accountId: string) =>
  invoke<GitHubRepoInfo[]>('github_list_repos', { accountId })

/** Resolves `sha → avatar URL` for the given commit SHAs; unresolved SHAs are simply absent. */
export const githubCommitAvatars = (
  accountId: string,
  owner: string,
  repo: string,
  shas: string[]
) => invoke<Record<string, string>>('github_commit_avatars', { accountId, owner, repo, shas })

/** Detects the repo's GitHub PR template(s) on disk (single file, multi-template dir, or none). */
export const getPrTemplate = (path: string) =>
  invoke<PrTemplateDetection>('get_pr_template', { path })
