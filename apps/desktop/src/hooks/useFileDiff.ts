import { useQuery } from '@tanstack/react-query'
import { getFileDiff } from '../lib/tauri'

export function useFileDiff(repoPath: string, filePath: string | null, staged: boolean, oid?: string) {
  return useQuery({
    queryKey: ['file-diff', repoPath, filePath, staged, oid],
    queryFn: () => getFileDiff(repoPath, filePath!, staged, oid),
    enabled: !!repoPath && !!filePath,
  })
}
