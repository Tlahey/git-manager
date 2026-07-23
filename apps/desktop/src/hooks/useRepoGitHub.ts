import useSWR from 'swr'
import { useSettingsStore } from '../stores/settings.store'
import { apiGetRemotes } from '../api/git.api'
import { firstGitHubOwnerRepo } from '../lib/githubRemote'

/**
 * Resolves a repo's GitHub context: `{ owner, repo }` parsed from its first GitHub remote, plus the
 * active account token. `ownerRepo` is null for non-GitHub repos; `token` is null when signed out.
 * Used by commit → PR / tag-release lookups that need both.
 */
export function useRepoGitHub(repoPath: string | null): {
  ownerRepo: { owner: string; repo: string } | null
  token: string | null
} {
  const githubSettings = useSettingsStore((s) => s.settings.github)
  const activeAccount =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) ?? null
  const token = activeAccount?.token ?? null

  const { data: remotes } = useSWR(
    repoPath ? ['repo-remotes', repoPath] : null,
    () => apiGetRemotes(repoPath as string),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  const ownerRepo = remotes ? firstGitHubOwnerRepo(remotes.map((r) => r.url)) : null
  return { ownerRepo, token }
}
