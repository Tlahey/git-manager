import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { useSettingsStore } from '../stores/settings.store'
import { useNotificationStore } from '../stores/notification.store'
import { useDevFlagsStore } from '../stores/devFlags.store'
import type { MockPR, DayCommit } from '../lib/github/types'
import { useDevFixtures } from './useDevFixtures'
import { fetchDashboardPullRequests, fetchGitHubContributions } from '../api/github.api'
import { useGithubPollInterval } from './useGithubPollInterval'

interface GitHubData {
  prs: MockPR[]
  commitDays: DayCommit[]
  yearDays: DayCommit[]
  loading: boolean
  isValidating: boolean
  error: string | null
  hasAccount: boolean
  username: string | null
  lastRefreshed: Date | null
  refresh: () => void
}

/**
 * A fixed "last refreshed" for the fixture path, so it doesn't move on every render.
 *
 * The contribution history that used to sit next to it was generated here too — at module scope,
 * so a production start-up built a year of random days and never used one of them. It now comes
 * from `useDevFixtures`, generated once per load inside the build that can actually show it.
 */
const fallbackRefreshed = new Date()

/**
 * The contribution calendar, or a year of zeroes.
 *
 * The heatmap is a fixed grid of 365 cells: given nothing it would render as a gap in the layout
 * rather than as an empty year, so the failure is padded rather than propagated. It is also the one
 * part of this refresh that must not be able to fail the rest — a calendar the token cannot read
 * (the `read:user` scope is optional) would otherwise take the pull-request list down with it.
 */
async function fetchContributionsOrEmptyYear(
  username: string,
  accountId: string
): Promise<DayCommit[]> {
  try {
    return await fetchGitHubContributions(username, accountId)
  } catch (e) {
    console.warn('Failed to fetch contributions calendar, falling back to empty list', e)
    return Array.from({ length: 365 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (364 - i))
      return { date: d.toISOString().slice(0, 10), commits: 0 }
    })
  }
}

export function useGitHubData(): GitHubData {
  const mockPRs = useNotificationStore((s) => s.mockPRs)
  const mockGitHub = useDevFlagsStore((s) => s.mockGitHub)
  const { contributions } = useDevFixtures()
  const githubSettings = useSettingsStore((s) => s.settings.github)
  const activeAccount =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) ?? null
  const accountId = activeAccount?.id ?? null
  const username = activeAccount?.user?.login ?? null

  const hasAccount = !!accountId && !!username

  // Local state to track the last refreshed time
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(
    hasAccount ? null : fallbackRefreshed
  )

  const swrKey = hasAccount ? ['github-data', accountId, username] : null

  // The app's biggest spender, and the only one mounted for the whole session (`App.tsx` →
  // `useNotificationWatcher`): two searches, a REST call per pull request that has moved, two CI
  // calls per pull request, and one GraphQL query. All three buckets are named because a refusal on
  // any of them stops the refresh at its first step.
  const refreshInterval = useGithubPollInterval(60_000, accountId, ['search', 'core', 'graphql'])

  const { data, error, mutate, isValidating } = useSWR(
    swrKey,
    async ([, tok, user]) => {
      // The two halves are independent, and the calendar must not wait on twenty-five pull requests
      // being enriched to appear. `fetchDashboardPullRequests` owns the enrichment — what it fetches,
      // what it skips, and how much of it runs at once — because none of that is React; see
      // `api/github/github-dashboard.api.ts`.
      const [prs, yearDays] = await Promise.all([
        fetchDashboardPullRequests(user, tok),
        fetchContributionsOrEmptyYear(user, tok),
      ])

      setLastRefreshed(new Date())

      return { prs, yearDays, commitDays: yearDays.slice(-14) }
    },
    {
      refreshInterval,
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
    }
  )

  const refresh = useCallback(() => {
    mutate()
  }, [mutate])

  if (!hasAccount) {
    // No account connected. The fixtures used to be handed over here unconditionally, which meant
    // a user who simply had not connected GitHub yet was shown ten invented pull requests —
    // invented authors, invented titles — rendered exactly like real ones. Showing fiction as fact
    // is a worse first impression than an empty list, and the list already has a decent empty
    // state. The fixtures are now a development flag (see `devFlags.store.ts`), not a consequence
    // of a missing token.
    return {
      prs: mockGitHub ? mockPRs : [],
      // Already empty unless the flag is on — `useDevFixtures` gates on it too.
      yearDays: contributions,
      commitDays: contributions.slice(-14),
      loading: false,
      isValidating: false,
      error: null,
      hasAccount: false,
      username: null,
      lastRefreshed: mockGitHub ? fallbackRefreshed : null,
      refresh,
    }
  }

  return {
    prs: data?.prs ?? [],
    yearDays: data?.yearDays ?? [],
    commitDays: data?.commitDays ?? [],
    loading: !data && !error,
    isValidating,
    error: error ? String(error) : null,
    hasAccount: true,
    username,
    lastRefreshed: lastRefreshed,
    refresh,
  }
}
