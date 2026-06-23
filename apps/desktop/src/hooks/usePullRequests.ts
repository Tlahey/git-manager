import { useQuery } from '@tanstack/react-query'
import type { PullRequest } from '@git-manager/git-types'

interface GitHubPrResponse {
  number: number
  title: string
  body: string | null
  state: string
  draft: boolean
  user: { login: string; avatar_url: string }
  head: { ref: string }
  base: { ref: string }
  html_url: string
  created_at: string
  updated_at: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  head_commit?: any
}

/** Parse une URL GitHub (HTTPS ou SSH) et retourne { owner, repo } ou null */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }
  return null
}

async function fetchPullRequests(
  owner: string,
  repo: string,
  token?: string,
): Promise<PullRequest[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  }
  if (token) headers['Authorization'] = `token ${token}`

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`,
    { headers },
  )
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)

  const raw: GitHubPrResponse[] = await res.json()

  return raw.map((pr): PullRequest => ({
    number: pr.number,
    title: pr.title,
    body: pr.body ?? '',
    state: pr.draft ? 'draft' : (pr.state as PullRequest['state']),
    author: pr.user.login,
    authorAvatar: pr.user.avatar_url,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    url: pr.html_url,
    ciStatus: null, // enrichi après si nécessaire
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    isDraft: pr.draft,
  }))
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
  // Détecte le premier remote GitHub
  const ownerRepo = remoteUrls
    .map((url) => parseGitHubUrl(url))
    .find((r) => r !== null) ?? null

  const isGithub = ownerRepo !== null

  const query = useQuery<PullRequest[], Error>({
    queryKey: ['pull-requests', ownerRepo?.owner, ownerRepo?.repo],
    queryFn: () =>
      fetchPullRequests(ownerRepo!.owner, ownerRepo!.repo, githubToken),
    enabled: enabled && isGithub,
    staleTime: 60_000,
    retry: 1,
  })

  const allPrs = query.data ?? []
  const myPrs = currentUser
    ? allPrs.filter((pr) => pr.author === currentUser)
    : []

  return {
    myPrs,
    allPrs,
    isGithub,
    isLoading: query.isLoading,
    error: query.error,
    ownerRepo,
  }
}
