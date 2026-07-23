import useSWR from 'swr'
import { useSettingsStore } from '../stores/settings.store'
import { fetchGitHubPRDetails } from '../api/github.api'

/**
 * Fetches the extra PR fields the Launchpad's list search doesn't return — currently the description
 * body — for one pull request, keyed by its `owner/repo` and number. Self-contained (owner/repo come
 * from the PR itself, the token from settings), so it needs no locally-cloned repo. Returns an empty
 * body while loading or when signed out.
 */
export function usePrOverview(
  fullName: string | undefined,
  prNumber: number
): { body: string; isLoading: boolean } {
  const githubSettings = useSettingsStore((s) => s.settings.github)
  const activeAccount =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) ?? null
  const token = activeAccount?.token ?? null

  const [owner, repo] = (fullName ?? '').split('/')

  const { data, isLoading } = useSWR(
    owner && repo && token ? ['launchpad-pr-overview', owner, repo, prNumber, token] : null,
    () =>
      fetchGitHubPRDetails(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
        token as string
      ),
    { revalidateOnFocus: false, refreshInterval: 60_000 }
  )

  return { body: data?.body ?? '', isLoading }
}
