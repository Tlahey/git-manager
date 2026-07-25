import useSWR from 'swr'
import { apiGetRepoFiles } from '../api/repo.api'

/**
 * Every file in the repository's working tree, for the project files explorer.
 *
 * Revalidating on focus is what keeps the tree honest when files are created or deleted outside the
 * app (an editor, a branch switch in a terminal). The listing walks the whole working tree, so the
 * dedupe window is generous: coming back to the window several times in a row shouldn't mean
 * several walks, and the tree is not the kind of data a few seconds of staleness hurts.
 */
export function useRepoFiles(repoPath: string | null) {
  return useSWR(
    repoPath ? ['repoFiles', repoPath] : null,
    ([, path]) => apiGetRepoFiles(path),
    {
      revalidateOnFocus: true,
      dedupingInterval: 10_000,
    }
  )
}
