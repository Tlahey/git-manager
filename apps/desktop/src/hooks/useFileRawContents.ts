import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGetFileRawContents } from '../api/git.api'

/** Both sides of one file's contents — what the editor panes actually render.
 *
 * `keepPreviousData` for the same reason as `useFileDiff`, and it matters more here: this is the
 * query whose absence unmounted Monaco. See that hook for the full note.
 */
export function useFileRawContents(
  repoPath: string,
  filePath: string | null,
  staged: boolean,
  oid?: string,
  baseOid?: string
) {
  return useQuery({
    queryKey: ['file-raw-contents', repoPath, filePath, staged, oid, baseOid],
    queryFn: () => apiGetFileRawContents(repoPath, filePath!, staged, oid, baseOid),
    enabled: !!repoPath && !!filePath,
    placeholderData: keepPreviousData,
  })
}
