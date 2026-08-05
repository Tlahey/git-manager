import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGetFileDiff } from '../api/git.api'

/** The diff metadata for one file (status, counts, hunks).
 *
 * `keepPreviousData`: the file path is part of the key, so without it every switch to another
 * file emptied `data` and flipped `isLoading` back on — which made the viewer tear its whole
 * editor down to a spinner and build a fresh Monaco instance for the next file, the flicker you
 * saw when clicking through a commit's file list. Holding the previous result keeps the panes
 * mounted across the switch; the caller distinguishes stale from settled with `isPlaceholderData`.
 */
export function useFileDiff(
  repoPath: string,
  filePath: string | null,
  staged: boolean,
  oid?: string,
  baseOid?: string
) {
  return useQuery({
    queryKey: ['file-diff', repoPath, filePath, staged, oid, baseOid],
    queryFn: () => apiGetFileDiff(repoPath, filePath!, staged, oid, baseOid),
    enabled: !!repoPath && !!filePath,
    placeholderData: keepPreviousData,
  })
}
