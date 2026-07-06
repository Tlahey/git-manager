import useSWR from 'swr'
import { apiGetRebaseState } from '../api/git.api'

export function useRebaseState(repoPath: string | null) {
  return useSWR(
    repoPath ? ['rebase-state', repoPath] : null,
    () => apiGetRebaseState(repoPath as string),
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
    }
  )
}
