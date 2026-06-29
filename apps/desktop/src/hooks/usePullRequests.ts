import useSWR from 'swr'
import type { PullRequest } from '@git-manager/git-types'
import { useSettingsStore } from '../stores/settings.store'
import { fetchRepoPRs } from '../api/github.api'

/** Parse une URL GitHub (HTTPS ou SSH) et retourne { owner, repo } ou null */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }
  return null
}

export interface UsePullRequestsOptions {
  remoteUrls: string[]
  currentUser?: string
  githubToken?: string
  enabled?: boolean
}

export interface UsePullRequestsResult {
  myPrs: PullRequest[]
  allPrs: PullRequest[]
  isGithub: boolean
  isLoading: boolean
  error: Error | null
  ownerRepo: { owner: string; repo: string } | null
}

export function usePullRequests({
  remoteUrls,
  currentUser,
  githubToken,
  enabled = true,
}: UsePullRequestsOptions): UsePullRequestsResult {
  const githubSettings = useSettingsStore((s) => s.settings.github)
  const activeAccount =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) || null
  const resolvedToken = githubToken || (activeAccount?.token ?? undefined)
  const resolvedUser = currentUser || (activeAccount?.user?.login ?? undefined)

  // Détecte le premier remote GitHub
  const ownerRepo =
    remoteUrls
      .map((url) => parseGitHubUrl(url))
      .find((r) => r !== null) ?? null

  const isGithub = ownerRepo !== null

  const swrKey =
    enabled && isGithub && ownerRepo
      ? ['repo-pull-requests', ownerRepo.owner, ownerRepo.repo, resolvedToken]
      : null

  const { data, error } = useSWR<PullRequest[], Error>(
    swrKey,
    async ([_, owner, repo, tok]) => {
      const raw = await fetchRepoPRs(owner, repo, tok ?? undefined)
      return raw.map((pr: any): PullRequest => ({
        number: pr.number,
        title: pr.title,
        body: pr.body ?? '',
        state: pr.draft ? 'draft' : (pr.state as PullRequest['state']),
        author: pr.user.login,
        authorAvatar: pr.user.avatar_url,
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
        url: pr.html_url,
        ciStatus: null,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        isDraft: pr.draft,
      }))
    },
    {
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
    }
  )

  const allPrs = data ?? []
  const myPrs = resolvedUser
    ? allPrs.filter((pr) => pr.author === resolvedUser)
    : []

  return {
    myPrs,
    allPrs,
    isGithub,
    isLoading: !data && !error && swrKey !== null,
    error: error || null,
    ownerRepo,
  }
}
