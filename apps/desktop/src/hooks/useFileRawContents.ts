import { useQuery } from '@tanstack/react-query'
import { apiGetFileRawContents } from '../api/git.api'

export function useFileRawContents(
  repoPath: string,
  filePath: string | null,
  staged: boolean,
  oid?: string,
  baseOid?: string
) {
  return useQuery({
    queryKey: ['file-raw-contents', repoPath, filePath, staged, oid, baseOid],
    queryFn: () => apiGetFileRawContents(repoPath, filePath!, staged, oid, baseOid),
    enabled: !!repoPath && !!filePath,
  })
}
