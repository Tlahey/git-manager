import { createContext, useContext } from 'react'
import useSWR from 'swr'
import { useSettingsStore } from '../stores/settings.store'
import { apiGetRemotes } from '../api/git.api'
import { firstGitHubOwnerRepo } from '../lib/githubRemote'

export interface OwnerRepo {
  owner: string
  repo: string
}

/**
 * Supplies `{ owner, repo }` directly, short-circuiting the git-remote lookup in {@link useRepoGitHub}.
 * The Launchpad uses this to drive the repo-bound PR view from a GitHub PR (which already knows its
 * `owner/repo`) without the repo being cloned locally. `null` (the default) preserves the normal
 * "resolve from the repo's remotes" behavior everywhere else.
 */
export const RepoGitHubOverrideContext = createContext<OwnerRepo | null>(null)

/**
 * Resolves a repo's GitHub context: `{ owner, repo }` parsed from its first GitHub remote, plus the
 * active account token. `ownerRepo` is null for non-GitHub repos; `token` is null when signed out.
 * Used by commit → PR / tag-release lookups that need both.
 *
 * When a {@link RepoGitHubOverrideContext} value is present, that `owner/repo` is used verbatim and
 * the remote lookup is skipped — this is how the cross-repo Launchpad opens the PR view for a repo
 * that isn't open locally.
 */
export function useRepoGitHub(repoPath: string | null): {
  ownerRepo: OwnerRepo | null
  token: string | null
} {
  const override = useContext(RepoGitHubOverrideContext)
  const githubSettings = useSettingsStore((s) => s.settings.github)
  const activeAccount =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) ?? null
  const token = activeAccount?.token ?? null

  const { data: remotes } = useSWR(
    !override && repoPath ? ['repo-remotes', repoPath] : null,
    () => apiGetRemotes(repoPath as string),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  const ownerRepo = override ?? (remotes ? firstGitHubOwnerRepo(remotes.map((r) => r.url)) : null)
  return { ownerRepo, token }
}
