/**
 * The GitHub view-models the app reads — pull requests, issues, contribution days and the status
 * vocabulary around them.
 *
 * They live in `lib/` rather than in `features/launchpad`, whose page is their busiest reader,
 * because the `api/github/*` layer builds them, the notification and dev-fixture machinery stores
 * them, and the graph's sidebar renders them. A DTO every layer touches is not one feature's.
 * (Unlike `packages/git-types`, none of these mirror a Rust struct: the frontend signs its own
 * GitHub requests, so nothing about them crosses the IPC boundary.)
 *
 * The `Mock` prefix is historical — these were seeded from fixtures before the API layer existed
 * and now carry real GitHub data.
 */

export type CiStatus = 'success' | 'failure' | 'running' | 'skipped' | null
export type PRStatus = 'open' | 'draft' | 'approved' | 'changes_requested' | 'merged' | 'closed'
export type ReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'commented'

export interface Collaborator {
  login: string
  avatar: string
}

export interface CiDetail {
  name: string
  status: 'success' | 'failure' | 'running' | 'skipped' | 'unknown'
  url?: string
}

export interface MockPR {
  id: string
  number: number
  title: string
  repo: string
  repoUrl: string
  fullName?: string
  /** Source branch name (`head.ref`), shown as a tag under the repo. Populated during enrichment. */
  headRef?: string
  url: string
  status: PRStatus
  ciStatus: CiStatus
  author: string
  authorAvatar: string
  collaborators: Collaborator[]
  filesChanged: number
  additions: number
  deletions: number
  createdAt: Date
  updatedAt: Date
  reviewStatus: ReviewStatus
  isDraft: boolean
  isFollowed?: boolean
  needsMyReview?: boolean
  labels: string[]
  comments: number
  ciDetails?: CiDetail[]
  needsRebase?: boolean
  /**
   * Auto-merge is armed on the PR ("merge when ready" — how a PR enters the repo's merge queue).
   * Only the PR details endpoint reports it, so it stays false until enrichment runs.
   */
  autoMerge?: boolean
}

export interface MockIssue {
  id: string
  number: number
  title: string
  /** Raw markdown body. Absent when GitHub omits it (an issue opened with no description). */
  body?: string
  repo: string
  /** `owner/repo` for the issue's repository, parsed from the API `repository_url`. Drives the
   * in-app issue panel and the local-repo lookup (View repo / Create a branch). */
  fullName?: string
  url: string
  status: 'open' | 'closed'
  author: string
  authorAvatar: string
  assignees: Collaborator[]
  labels: string[]
  createdAt: Date
  updatedAt: Date
  comments: number
  /** Count of 👍 (`+1`) reactions, shown as a row tag. */
  thumbsUp: number
}

export interface DayCommit {
  date: string
  commits: number
}
