import useSWR from 'swr'
import { apiListTrackedFiles } from '../api/git.api'

/**
 * Tracked file paths of the repo (`git ls-files`), sorted and de-duplicated. Backed by
 * `list_tracked_files`. Fetched lazily — pass `enabled: false` to skip until needed (the command
 * palette only wants this list while it's open, not on every repo view).
 */
export function useTrackedFiles(repoPath: string | null, enabled = true) {
  return useSWR(
    enabled && repoPath ? ['tracked-files', repoPath] : null,
    () => apiListTrackedFiles(repoPath as string),
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
    }
  )
}
