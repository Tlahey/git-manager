import { useQuery } from '@tanstack/react-query'
import { apiGetFileRawContents } from '../api/git.api'

export function useFileRawContents(repoPath: string, filePath: string | null, staged: boolean, oid?: string) {
  return useQuery({
    queryKey: ['file-raw-contents', repoPath, filePath, staged, oid],
    queryFn: () => apiGetFileRawContents(repoPath, filePath!, staged, oid),
    enabled: !!repoPath && !!filePath,
  })
}
