import { useQuery } from '@tanstack/react-query'
import { getFileDiff } from '../lib/tauri'

export function useFileDiff(repoPath: string, filePath: string | null, staged: boolean) {
  return useQuery({
    queryKey: ['file-diff', repoPath, filePath, staged],
    queryFn: () => getFileDiff(repoPath, filePath!, staged),
    enabled: !!repoPath && !!filePath,
  })
}
