import useSWR from 'swr'
import { apiGetRepoFiles } from '../api/repo.api'

export function useRepoFiles(repoPath: string | null) {
  return useSWR(
    repoPath ? ['repoFiles', repoPath] : null,
    ([, path]) => apiGetRepoFiles(path),
    {
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    }
  )
}
