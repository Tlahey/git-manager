import { useMemo } from 'react'
import type { BoardSource } from '@git-manager/git-types'
import { useRepoGitHub, type OwnerRepo } from '../../../hooks/useRepoGitHub'
import { useDevFlagsStore } from '../../../stores/devFlags.store'
import { localBoardBackend } from '../api/local-board.api'
import { createRemoteBoardBackend } from '../api/remote-board.api'
import { mockRemoteBoardBackend } from '../api/mock-remote-board.api'
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
  const mockGitHub = useDevFlagsStore((s) => s.mockGitHub)

  const remoteBackend = useMemo(() => {
    if (ownerRepo && accountId)
      return createRemoteBoardBackend(ownerRepo.owner, ownerRepo.repo, accountId)
    // No connected account: offer the in-memory fixture double instead of hiding the option, the
    // same way `useGitHubData` falls back to `mockPRs` for the Launchpad — gated on the same flag,
    // for the same reason (a non-interactive e2e/docs run, or a developer previewing the feature,
    // with no real GitHub account to connect). See `mock-remote-board.api.ts`'s own doc comment for
    // why the real backend cannot be exercised by the e2e suite at all.
    if (mockGitHub) return mockRemoteBoardBackend
    return null
  }, [ownerRepo, accountId, mockGitHub])

  function backendFor(source: BoardSource): BoardBackend {
    if (source === 'local') return localBoardBackend
    if (!remoteBackend) throw new Error('This repository has no connected GitHub account')
    return remoteBackend
  }

  return { ownerRepo, accountId, remoteBackend, backendFor }
}
