import useSWR from 'swr'
import { apiListConflictedFiles } from '../api/conflict.api'

export function useConflictedFiles(repoPath: string | null) {
  return useSWR<string[], Error>(
    repoPath ? ['conflicted-files', repoPath] : null,
    () => apiListConflictedFiles(repoPath as string),
    {
      refreshInterval: 4000,
    }
  )
}
