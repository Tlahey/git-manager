import useSWR from 'swr'
import { apiGetFileHistory } from '../api/git.api'

/** Commits that modified `filePath`, newest first (backed by `get_file_history`). */
export function useFileHistory(repoPath: string | null, filePath: string | null) {
  return useSWR(
    repoPath && filePath ? ['file-history', repoPath, filePath] : null,
    () => apiGetFileHistory(repoPath as string, filePath as string),
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
    }
  )
}
