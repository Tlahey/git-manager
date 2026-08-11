import useSWR from 'swr'
import type { PullRequest } from '@git-manager/git-types'
import { useGithubAccount } from './useGithubAccount'
import { fetchRepoPRs, rawToPullRequest } from '../api/github.api'
import { firstGitHubOwnerRepo } from '../lib/githubRemote'

export interface UsePullRequestsOptions {
  remoteUrls: string[]
  currentUser?: string
  githubAccountId?: string
  enabled?: boolean
}

export interface UsePullRequestsResult {
  myPrs: PullRequest[]
  allPrs: PullRequest[]
  isGithub: boolean
  /** Whether a GitHub account (or an explicit `githubAccountId`) backs the request — see below. */
  isConnected: boolean
  isLoading: boolean
  error: Error | null
  ownerRepo: { owner: string; repo: string } | null
}

/**
 * The pull requests of one repository, resolved from its first GitHub remote.
 *
 * Nothing is fetched without a token. An anonymous call would work on a public repo and fail on
 * every private one — and, when the rate limit is spent, on both — so the signed-out user was shown
 * a transport error where the answer is "connect an account". `isConnected` is what the sidebar
 * renders that answer from; see {@link useGithubAccount}.
 */
export function usePullRequests({
  remoteUrls,
  currentUser,
  githubAccountId,
  enabled = true,
}: UsePullRequestsOptions): UsePullRequestsResult {
  const account = useGithubAccount()
  const resolvedAccountId = githubAccountId || account.accountId || undefined
  const resolvedUser = currentUser || account.login || undefined
  const isConnected = !!resolvedAccountId

  // Find the first GitHub remote
  const ownerRepo = firstGitHubOwnerRepo(remoteUrls)

  const isGithub = ownerRepo !== null

  const swrKey =
    enabled && isGithub && isConnected && ownerRepo
      ? ['repo-pull-requests', ownerRepo.owner, ownerRepo.repo, resolvedAccountId]
      : null

  const { data, error } = useSWR<PullRequest[], Error>(
    swrKey,
    async ([_, owner, repo, tok]) => {
      const raw = await fetchRepoPRs(owner, repo, tok ?? undefined)
      return raw.map(rawToPullRequest)
    },
    {
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
    }
  )

  const allPrs = data ?? []
  const myPrs = resolvedUser ? allPrs.filter((pr) => pr.author === resolvedUser) : []

  return {
    myPrs,
    allPrs,
    isGithub,
    isConnected,
    isLoading: !data && !error && swrKey !== null,
    error: error || null,
    ownerRepo,
  }
}
