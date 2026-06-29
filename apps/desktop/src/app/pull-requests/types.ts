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
}

export interface MockIssue {
  id: string
  number: number
  title: string
  repo: string
  url: string
  status: 'open' | 'closed'
  author: string
  authorAvatar: string
  assignees: Collaborator[]
  labels: string[]
  createdAt: Date
  updatedAt: Date
  comments: number
}

export interface DayCommit {
  date: string
  commits: number
}

export type SortKey = 'date' | 'status' | 'author' | 'repo' | 'files'
export type SortDir = 'asc' | 'desc'
export type InnerTab = 'prs' | 'issues' | 'waiting' | 'stats' | 'views'
