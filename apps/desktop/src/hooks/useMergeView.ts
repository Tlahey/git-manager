import useSWR from 'swr'
import { apiGetMergeView } from '../api/conflict.api'

export function useMergeView(repoPath: string | null, filePath: string | null) {
  return useSWR(
    repoPath && filePath ? ['merge-view', repoPath, filePath] : null,
    () => apiGetMergeView(repoPath as string, filePath as string),
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
    }
  )
}
