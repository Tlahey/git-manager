import useSWR from 'swr'
import { apiGithubListRepos } from '../api/github.api'
import type { GitHubRepoInfo } from '../lib/tauri'

export function useGitHubRepos(accountId: string | null) {
  return useSWR<GitHubRepoInfo[], Error>(
    accountId ? ['github-repos', accountId] : null,
    () => apiGithubListRepos(accountId as string),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  )
}
