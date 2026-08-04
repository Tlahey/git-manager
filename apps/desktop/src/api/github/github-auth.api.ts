// Tauri backend GitHub integration wrappers
import {
  githubDeviceCode,
  githubPollToken,
  githubGetUser,
  githubListRepos,
  githubCommitAvatars,
} from '../../lib/tauri'

export async function apiGithubDeviceCode(scope: string) {
  return githubDeviceCode(scope)
}

export async function apiGithubPollToken(deviceCode: string) {
  return githubPollToken(deviceCode)
}

export async function apiGithubGetUser(token: string) {
  return githubGetUser(token)
}

export async function apiGithubListRepos(token: string) {
  return githubListRepos(token)
}

/** Resolves `sha → avatar URL` for the given commit SHAs (unresolved SHAs are absent). */
export async function apiGithubCommitAvatars(
  token: string,
  owner: string,
  repo: string,
  shas: string[]
): Promise<Record<string, string>> {
  return githubCommitAvatars(token, owner, repo, shas)
}
