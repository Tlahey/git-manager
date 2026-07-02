import useSWR from 'swr'
import { apiStashList } from '../api/git.api'
import type { GitStash } from '@git-manager/git-types'

export function useGitStashes(repoPath: string | null) {
  return useSWR<GitStash[], Error>(
    repoPath ? ['git-stashes', repoPath] : null,
    () => apiStashList(repoPath as string),
    {
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    }
  )
}
