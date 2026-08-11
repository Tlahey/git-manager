import useSWR from 'swr'
import { apiGetRepoFiles } from '../../../api/repo.api'

/**
 * The repository's tracked files, for the project files explorer — not the contents of the working
 * directory. A file git doesn't track isn't in this list; it belongs to the working-tree panel,
 * which is where it can be staged, and it joins this one once it is. The backend's
 * `list_tracked_files_on_disk` holds the reasoning.
 *
 * Revalidating on focus is what keeps the tree honest when the repository changes outside the app
 * (a branch switch or a `git add` in a terminal, a file deleted from an editor). The listing reads
 * the whole index, so the dedupe window is generous: coming back to the window several times in a
 * row shouldn't mean several reads, and the tree is not the kind of data a few seconds of staleness
 * hurts.
 */
export function useRepoFiles(repoPath: string | null) {
  return useSWR(repoPath ? ['repoFiles', repoPath] : null, ([, path]) => apiGetRepoFiles(path), {
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
  })
}
