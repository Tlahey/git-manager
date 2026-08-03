import {
  gitlabDeviceCode,
  gitlabPollToken,
  gitlabGetUser,
  bitbucketGetUser,
  type GitLabDeviceCodeResponse,
  type GitLabUserInfo,
  type BitbucketUserInfo,
  type PollTokenResponse,
} from '../lib/tauri'

export type { GitLabDeviceCodeResponse, GitLabUserInfo, BitbucketUserInfo, PollTokenResponse }

/**
 * Sign-in for the two forges that are not GitHub.
 *
 * They are in one file because they answer the same question — "who is this account, and may we
 * act as it?" — and in *different* ways, which is the thing worth stating once:
 *
 * - **GitLab** does the OAuth device flow, exactly like GitHub: a code, a page to approve it on,
 *   and polling. It needs an instance (self-hosted is a first-class case) and, for a self-hosted
 *   one, that instance's own application id.
 * - **Bitbucket** cannot. Atlassian supports neither the device grant nor anything usable without
 *   a redirect URI, so a token typed in by hand is the honest option — but a *verified* one:
 *   `apiBitbucketGetUser` is what turns "some text was entered" into "this account exists and
 *   these credentials work".
 */

/** Scopes requested from GitLab: read/write API access on the user's behalf. */
export const GITLAB_SCOPE = 'api read_user'

export async function apiGitlabDeviceCode(instanceUrl: string, clientId: string | null) {
  return gitlabDeviceCode(instanceUrl, clientId, GITLAB_SCOPE)
}

export async function apiGitlabPollToken(
  instanceUrl: string,
  clientId: string | null,
  deviceCode: string
) {
  return gitlabPollToken(instanceUrl, clientId, deviceCode)
}

export async function apiGitlabGetUser(instanceUrl: string, token: string) {
  return gitlabGetUser(instanceUrl, token)
}

export async function apiBitbucketGetUser(username: string, token: string) {
  return bitbucketGetUser(username, token)
}
