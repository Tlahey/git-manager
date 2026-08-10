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

export interface PollTokenResponse {
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

export const githubGetUser = (token: string) => invoke<GitHubUserInfo>('github_get_user', { token })

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
  invoke<PollTokenResponse>('gitlab_poll_token', { instanceUrl, clientId, deviceCode })

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

export const githubListRepos = (token: string) =>
  invoke<GitHubRepoInfo[]>('github_list_repos', { token })

/** Resolves `sha → avatar URL` for the given commit SHAs; unresolved SHAs are simply absent. */
export const githubCommitAvatars = (token: string, owner: string, repo: string, shas: string[]) =>
  invoke<Record<string, string>>('github_commit_avatars', { token, owner, repo, shas })

/** Detects the repo's GitHub PR template(s) on disk (single file, multi-template dir, or none). */
export const getPrTemplate = (path: string) =>
  invoke<PrTemplateDetection>('get_pr_template', { path })
