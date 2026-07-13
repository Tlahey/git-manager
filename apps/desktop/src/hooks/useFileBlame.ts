import useSWR from 'swr'
import { apiBlameFile } from '../api/git.api'

/** Line-level blame for `filePath` at `oid` (or HEAD when null), backed by `git_blame_file`. */
export function useFileBlame(
  repoPath: string | null,
  filePath: string | null,
  oid?: string | null
) {
  return useSWR(
    repoPath && filePath ? ['file-blame', repoPath, filePath, oid ?? null] : null,
    () => apiBlameFile(repoPath as string, filePath as string, oid ?? undefined),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )
}
