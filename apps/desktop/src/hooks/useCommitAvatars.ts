import useSWR from 'swr'
import { apiGithubCommitAvatars } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/**
 * Resolves GitHub author avatars for the given commit SHAs when the repo lives on GitHub and a
 * token is configured. Returns a `sha → avatarUrl` map (empty for SHAs GitHub couldn't resolve, or
 * for everything when there's no token / non-GitHub remote) — callers fall back to initials.
 */
export function useCommitAvatars(repoPath: string | null, shas: string[]): Record<string, string> {
  const { ownerRepo, accountId } = useRepoGitHub(repoPath)

  // Stable, deduplicated key so unrelated re-renders don't refetch.
  const uniqueShas = Array.from(new Set(shas)).sort()

  const swrKey =
    accountId && ownerRepo && uniqueShas.length > 0
      ? ['commit-avatars', ownerRepo.owner, ownerRepo.repo, accountId, uniqueShas.join(',')]
      : null

  const { data } = useSWR(
    swrKey,
    () =>
      apiGithubCommitAvatars(
        accountId as string,
        (ownerRepo as { owner: string; repo: string }).owner,
        (ownerRepo as { owner: string; repo: string }).repo,
        uniqueShas
      ),
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
    }
  )

  return data ?? {}
}
