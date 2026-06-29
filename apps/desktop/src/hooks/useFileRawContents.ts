import { useQuery } from '@tanstack/react-query'
import { getFileRawContents } from '../lib/tauri'

export function useFileRawContents(repoPath: string, filePath: string | null, staged: boolean, oid?: string) {
  return useQuery({
    queryKey: ['file-raw-contents', repoPath, filePath, staged, oid],
    queryFn: () => getFileRawContents(repoPath, filePath!, staged, oid),
    enabled: !!repoPath && !!filePath,
  })
}
