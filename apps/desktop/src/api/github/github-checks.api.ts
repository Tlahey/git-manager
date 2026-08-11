import { ghFetch, ghGraphQL } from './githubApiShared'

export interface GhCheckRun {
  name?: string
  status: string
  conclusion: string | null
  html_url?: string
}

export interface GhCheckRunsResponse {
  total_count?: number
  check_runs?: GhCheckRun[]
}

export interface GhCommitStatus {
  state: string
  context?: string
  target_url?: string
}

export interface GhCommitStatusResponse {
  total_count?: number
  state?: string
  statuses?: GhCommitStatus[]
}

export async function fetchGitHubCommitCiStatus(
  owner: string,
  repo: string,
  sha: string,
  accountId: string
): Promise<{ checkRunsRes: GhCheckRunsResponse | null; statusRes: GhCommitStatusResponse | null }> {
  const [checkRunsRes, statusRes] = await Promise.all([
    ghFetch<GhCheckRunsResponse>(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs`,
      accountId
    ).catch(() => null),
    ghFetch<GhCommitStatusResponse>(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`,
      accountId
    ).catch(() => null),
  ])
  return { checkRunsRes, statusRes }
}

/** Normalised category for a single check/status row (drives its icon + grouping). */
export type PrCheckCategory = 'success' | 'failure' | 'in_progress' | 'skipped' | 'neutral'

export interface PrCheck {
  name: string
  category: PrCheckCategory
  /** Required by branch protection for this PR (the "Required" badge). */
  isRequired: boolean
  url?: string | null
  startedAt?: string | null
  /** The app/integration that produced the check (e.g. "GitHub Actions"). */
  appName?: string | null
}

/** GitHub's mergeability signal — same enum GitHub's merge box is driven by. */
export type PrMergeStateStatus =
  'BEHIND' | 'BLOCKED' | 'CLEAN' | 'DIRTY' | 'DRAFT' | 'HAS_HOOKS' | 'UNKNOWN' | 'UNSTABLE'

export type PrReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null

export interface PrMergeability {
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  mergeStateStatus: PrMergeStateStatus
  reviewDecision: PrReviewDecision
  checks: PrCheck[]
  /** Whether the current viewer can bypass branch protections and merge immediately
   * (GitHub's own "Merge without waiting for requirements to be met" affordance). */
  viewerCanMergeAsAdmin: boolean
}

interface RawCheckContext {
  __typename: 'CheckRun' | 'StatusContext'
  name?: string
  status?: string
  conclusion?: string | null
  startedAt?: string | null
  detailsUrl?: string | null
  context?: string
  state?: string
  targetUrl?: string | null
  isRequired?: boolean
  checkSuite?: { app?: { name?: string } | null } | null
}

function checkRunCategory(status?: string, conclusion?: string | null): PrCheckCategory {
  if (status !== 'COMPLETED') return 'in_progress'
  switch (conclusion) {
    case 'SUCCESS':
      return 'success'
    case 'SKIPPED':
      return 'skipped'
    case 'NEUTRAL':
    case 'STALE':
      return 'neutral'
    default:
      // FAILURE, TIMED_OUT, CANCELLED, ACTION_REQUIRED, STARTUP_FAILURE
      return 'failure'
  }
}

function statusContextCategory(state?: string): PrCheckCategory {
  switch (state) {
    case 'SUCCESS':
      return 'success'
    case 'PENDING':
    case 'EXPECTED':
      return 'in_progress'
    default:
      return 'failure' // FAILURE, ERROR
  }
}

function normalizeCheckContext(c: RawCheckContext): PrCheck {
  if (c.__typename === 'StatusContext') {
    return {
      name: c.context ?? 'status',
      category: statusContextCategory(c.state),
      isRequired: !!c.isRequired,
      url: c.targetUrl ?? null,
      startedAt: null,
      appName: null,
    }
  }
  return {
    name: c.name ?? 'check',
    category: checkRunCategory(c.status, c.conclusion),
    isRequired: !!c.isRequired,
    url: c.detailsUrl ?? null,
    startedAt: c.startedAt ?? null,
    appName: c.checkSuite?.app?.name ?? null,
  }
}

/**
 * Full mergeability + checks for one PR, via GraphQL (REST can't give per-check `isRequired`,
 * `mergeStateStatus` or `reviewDecision`). Powers the GitHub-style merge box.
 */
export async function fetchPrMergeability(
  owner: string,
  repo: string,
  prNumber: number,
  accountId: string
): Promise<PrMergeability> {
  const query = `query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){
      pullRequest(number:$number){
        mergeable
        mergeStateStatus
        reviewDecision
        viewerCanMergeAsAdmin
        commits(last:1){nodes{commit{statusCheckRollup{contexts(first:100){nodes{
          __typename
          ... on CheckRun{name status conclusion startedAt detailsUrl isRequired(pullRequestNumber:$number) checkSuite{app{name}}}
          ... on StatusContext{context state targetUrl isRequired(pullRequestNumber:$number)}
        }}}}}}
      }
    }
  }`
  const data = await ghGraphQL<{
    repository?: {
      pullRequest?: {
        mergeable?: PrMergeability['mergeable']
        mergeStateStatus?: PrMergeStateStatus
        reviewDecision?: PrReviewDecision
        viewerCanMergeAsAdmin?: boolean
        commits?: {
          nodes?: Array<{
            commit?: { statusCheckRollup?: { contexts?: { nodes?: RawCheckContext[] } } }
          }>
        }
      }
    }
  }>(
    query,
    { owner, repo, number: prNumber },
    accountId,
    'application/vnd.github.merge-info-preview+json'
  )

  const prNode = data.repository?.pullRequest
  const contexts = prNode?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? []
  return {
    mergeable: prNode?.mergeable ?? 'UNKNOWN',
    mergeStateStatus: prNode?.mergeStateStatus ?? 'UNKNOWN',
    reviewDecision: prNode?.reviewDecision ?? null,
    checks: contexts.map(normalizeCheckContext),
    viewerCanMergeAsAdmin: prNode?.viewerCanMergeAsAdmin ?? false,
  }
}
