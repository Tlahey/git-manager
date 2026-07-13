import useSWR from 'swr'
import { apiGetTagContainingCommit } from '../api/git.api'

/** Short name of the earliest tag whose history contains `oid` (the first release it shipped in). */
export function useCommitTag(repoPath: string | null, oid: string | null): string | null {
  const { data } = useSWR(
    repoPath && oid ? ['commit-tag', repoPath, oid] : null,
    () => apiGetTagContainingCommit(repoPath as string, oid as string),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )
  return data ?? null
}
