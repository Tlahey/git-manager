import useSWR from 'swr'
import { useSettingsStore } from '../stores/settings.store'
import { useRepoDataStore } from '../stores/repoData.store'
import { apiGetRemotes } from '../api/git.api'
import { fetchGitHubRepoIssues } from '../api/github.api'
import { firstGitHubOwnerRepo } from '../lib/githubRemote'
import { useDevFixtures } from './useDevFixtures'
import type { MockIssue } from '../app/pull-requests/types'

interface RepoIssuesData {
  issues: MockIssue[]
  loading: boolean
  isValidating: boolean
  error: string | null
  /** Revalidate the issues list — e.g. after closing an issue so it leaves the open view. */
  refresh: () => void
}

/**
 * Issues for the projects added to the app (the saved repos), not the signed-in user's assignee
 * list — so open issues others filed on your repos show up too. Each saved repo's `owner/repo` is
 * resolved from its GitHub remote (like the PR views do), then all of them are fetched in one search.
 *
 * Kept separate from {@link useGitHubData} (PRs/contributions) because it's keyed on the repo list,
 * not just the token — adding/removing a repo must refetch.
 *
 * Without a token the list is **empty**, unless a development build has the `mockGitHub` flag on.
 * It used to serve the four fixture issues to anyone without a token, so a user who simply hadn't
 * connected their GitHub account was shown invented issues — invented authors, invented titles,
 * invented thumbs-up counts — rendered exactly like real ones. That is the same defect
 * `useGitHubData` carried for pull requests, and it is fixed the same way: fiction presented as
 * fact is a worse first impression than an empty list.
 */
export function useGitHubRepoIssues(): RepoIssuesData {
  const { issues: fixtureIssues } = useDevFixtures()
  const githubSettings = useSettingsStore((s) => s.settings.github)
  const activeAccount =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) ?? null
  const token = activeAccount?.token ?? null
  const username = activeAccount?.user?.login ?? null
  const hasToken = !!token && !!username

  const savedRepos = useRepoDataStore((s) => s.savedRepos)
  const paths = savedRepos.map((r) => r.path)

  const { data, error, isValidating, mutate } = useSWR(
    hasToken && paths.length > 0 ? ['github-repo-issues', token, paths.join('\n')] : null,
    async ([, tok]) => {
      const ownerRepos = (
        await Promise.all(
          paths.map(async (path) => {
            try {
              const remotes = await apiGetRemotes(path)
              return firstGitHubOwnerRepo(remotes.map((r) => r.url))
            } catch (e) {
              // A repo whose remotes can't be read (moved/removed on disk) just drops out.
              console.warn('Failed to resolve GitHub remote for issues', path, e)
              return null
            }
          })
        )
      ).filter((r): r is { owner: string; repo: string } => r !== null)

      return fetchGitHubRepoIssues(ownerRepos, tok as string)
    },
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
    }
  )

  if (!hasToken) {
    // Empty unless a development build asked for the fixtures — `useDevFixtures` gates on the flag.
    return {
      issues: fixtureIssues,
      loading: false,
      isValidating: false,
      error: null,
      refresh: () => {},
    }
  }

  return {
    issues: data ?? [],
    loading: !data && !error && paths.length > 0,
    isValidating,
    error: error ? String(error) : null,
    refresh: () => void mutate(),
  }
}
