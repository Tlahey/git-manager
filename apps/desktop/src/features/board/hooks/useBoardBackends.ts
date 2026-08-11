import { useMemo } from 'react'
import type { BoardSource } from '@git-manager/git-types'
import { useRepoGitHub, type OwnerRepo } from '../../../hooks/useRepoGitHub'
import { localBoardBackend } from '../api/local-board.api'
import { createRemoteBoardBackend } from '../api/remote-board.api'
import type { BoardBackend } from '../api/boardBackend'

export interface BoardBackends {
  /** The repo's GitHub coordinates, or `null` when no account is connected to it. */
  ownerRepo: OwnerRepo | null
  accountId: string | null
  /** `null` without a connected account — which is what gates offering a remote board at all. */
  remoteBackend: BoardBackend | null
  /** The implementation a board of that `source` is served by. */
  backendFor: (source: BoardSource) => BoardBackend
}

/**
 * Resolves the pair of {@link BoardBackend} implementations for one repository.
 *
 * The local backend is a module singleton — it needs nothing but the repo path, which every call
 * already carries. The remote one is built per `(owner, repo, token)` and so has to be memoised:
 * it is a SWR key input downstream, and a fresh object on every render would refetch the board
 * forever.
 */
export function useBoardBackends(repoPath: string): BoardBackends {
  const { ownerRepo, accountId } = useRepoGitHub(repoPath)

  const remoteBackend = useMemo(
    () =>
      ownerRepo && accountId
        ? createRemoteBoardBackend(ownerRepo.owner, ownerRepo.repo, accountId)
        : null,
    [ownerRepo, accountId]
  )

  function backendFor(source: BoardSource): BoardBackend {
    if (source === 'local') return localBoardBackend
    if (!remoteBackend) throw new Error('This repository has no connected GitHub account')
    return remoteBackend
  }

  return { ownerRepo, accountId, remoteBackend, backendFor }
}
