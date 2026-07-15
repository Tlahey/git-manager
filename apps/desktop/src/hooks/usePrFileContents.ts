import useSWR from 'swr'
import { fetchFileContentAtRef, type GhPrFile } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'
import { usePrDetail } from './usePrDetail'
import { usePrFiles } from './usePrFiles'

interface PrFileContents {
  file: GhPrFile | undefined
  original: string
  modified: string
  isBinary: boolean
  isLoading: boolean
}

/** A NUL byte is a reliable "this is binary, don't diff it" signal in the fetched raw content. */
const NUL = String.fromCharCode(0)

/**
 * The two versions of a PR file — its content on the base (`original`) and on the head (`modified`) —
 * fetched from GitHub so the shared diff editor can render them (added files have an empty original,
 * removed files an empty modified; renames use the previous path on the base side). Enables the same
 * Monaco diff/file view as a commit file, instead of a raw patch.
 */
export function usePrFileContents(
  repoPath: string | null,
  prNumber: number | null,
  filename: string | null
): PrFileContents {
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const { pr } = usePrDetail(repoPath, prNumber)
  const { files, isLoading: filesLoading } = usePrFiles(repoPath, prNumber)

  const file = filename ? files.find((f) => f.filename === filename) : undefined
  const baseSha = pr?.base?.sha ?? null
  const headSha = pr?.head?.sha ?? null

  const { data, isLoading } = useSWR(
    file && ownerRepo && token && baseSha && headSha
      ? ['pr-file-content', ownerRepo.owner, ownerRepo.repo, baseSha, headSha, file.filename, token]
      : null,
    async () => {
      const status = file!.status
      const oldPath = file!.previous_filename ?? file!.filename
      // Added/copied files have no base version; removed files have no head version.
      const needBase = status !== 'added' && status !== 'copied'
      const needHead = status !== 'removed'
      const [original, modified] = await Promise.all([
        needBase
          ? fetchFileContentAtRef(ownerRepo!.owner, ownerRepo!.repo, oldPath, baseSha!, token!)
          : Promise.resolve(''),
        needHead
          ? fetchFileContentAtRef(ownerRepo!.owner, ownerRepo!.repo, file!.filename, headSha!, token!)
          : Promise.resolve(''),
      ])
      return { original: original ?? '', modified: modified ?? '' }
    },
    { revalidateOnFocus: false }
  )

  const original = data?.original ?? ''
  const modified = data?.modified ?? ''
  const isBinary = original.includes(NUL) || modified.includes(NUL)

  return { file, original, modified, isBinary, isLoading: filesLoading || isLoading }
}
