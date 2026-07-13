import useSWR from 'swr'
import { apiGithubCommitAvatars } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/**
 * Resolves GitHub author avatars for the given commit SHAs when the repo lives on GitHub and a
 * token is configured. Returns a `sha → avatarUrl` map (empty for SHAs GitHub couldn't resolve, or
 * for everything when there's no token / non-GitHub remote) — callers fall back to initials.
 */
export function useCommitAvatars(
  repoPath: string | null,
  shas: string[]
): Record<string, string> {
  const { ownerRepo, token } = useRepoGitHub(repoPath)

  // Stable, deduplicated key so unrelated re-renders don't refetch.
  const uniqueShas = Array.from(new Set(shas)).sort()

  const swrKey =
    token && ownerRepo && uniqueShas.length > 0
      ? ['commit-avatars', ownerRepo.owner, ownerRepo.repo, token, uniqueShas.join(',')]
      : null

  const { data } = useSWR(
    swrKey,
    () =>
      apiGithubCommitAvatars(
        token as string,
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
