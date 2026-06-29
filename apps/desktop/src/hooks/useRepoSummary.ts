import useSWR from 'swr'
import type { GitRepoSummary } from '@git-manager/git-types'
import { apiGetRepoSummary } from '../api/repo.api'

export function useRepoSummary(path: string | null) {
  return useSWR<GitRepoSummary, Error>(
    path ? ['repo-summary', path] : null,
    () => apiGetRepoSummary(path as string),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  )
}
