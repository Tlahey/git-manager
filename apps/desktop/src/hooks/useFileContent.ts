import useSWR from 'swr'
import { getFileRawContents } from '../lib/tauri'

export function useFileContent(repoPath: string | null, filePath: string | null) {
  return useSWR(
    repoPath && filePath ? ['fileContent', repoPath, filePath] : null,
    async ([, rPath, fPath]) => {
      const res = await getFileRawContents(rPath, fPath, false)
      return res.modified
    },
    {
      revalidateOnFocus: false,
    }
  )
}
