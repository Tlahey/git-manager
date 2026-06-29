import useSWR from 'swr'
import { apiGithubListRepos } from '../api/github.api'
import type { GitHubRepoInfo } from '../lib/tauri'

export function useGitHubRepos(token: string | null) {
  return useSWR<GitHubRepoInfo[], Error>(
    token ? ['github-repos', token] : null,
    () => apiGithubListRepos(token as string),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  )
}
