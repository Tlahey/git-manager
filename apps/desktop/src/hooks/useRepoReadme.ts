import useSWR from 'swr'
import { apiGetRepoReadme } from '../api/repo.api'

export function useRepoReadme(path: string | null) {
  return useSWR<string, Error>(
    path ? ['repo-readme', path] : null,
    () => apiGetRepoReadme(path as string),
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000,
    }
  )
}
