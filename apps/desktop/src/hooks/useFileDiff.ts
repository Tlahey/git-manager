import { useQuery } from '@tanstack/react-query'
import { apiGetFileDiff } from '../api/git.api'

export function useFileDiff(
  repoPath: string,
  filePath: string | null,
  staged: boolean,
  oid?: string,
  baseOid?: string
) {
  return useQuery({
    queryKey: ['file-diff', repoPath, filePath, staged, oid, baseOid],
    queryFn: () => apiGetFileDiff(repoPath, filePath!, staged, oid, baseOid),
    enabled: !!repoPath && !!filePath,
  })
}
