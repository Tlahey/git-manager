import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Rocket,
  GitPullRequest,
  GitMerge,
  AlertCircle,
  Star,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  Plus,
  MoreHorizontal,
  ArrowUpDown,

  ExternalLink,
  Link,
  GitCommit,
  BarChart2,
  FileText,
  Trash2,
  RefreshCw,
  BookOpen,
  Pin,
  Activity,
  TrendingUp,
  CheckSquare,
  Circle,
  WifiOff,
  Sliders,
  Pencil,
  Save,
  Clock,
  Layers,
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settings.store'
import { useLaunchpadStore, type SavedFilter, type FilterType, type FilterStatus } from '../../stores/launchpad.store'
import { Tooltip, useImperativeTooltip } from '../../components/ui/Tooltip'

// ─── Types ────────────────────────────────────────────────────────────────────

type CiStatus = 'success' | 'failure' | 'running' | 'skipped' | null
type PRStatus = 'open' | 'draft' | 'approved' | 'changes_requested' | 'merged' | 'closed'
type ReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'commented'

interface Collaborator { login: string; avatar: string }

interface CiDetail {
  name: string
  status: 'success' | 'failure' | 'running' | 'skipped' | 'unknown'
  url?: string
}

interface MockPR {
  id: string; number: number; title: string; repo: string; repoUrl: string; url: string
  status: PRStatus; ciStatus: CiStatus; author: string; authorAvatar: string
  collaborators: Collaborator[]; filesChanged: number; additions: number; deletions: number
  createdAt: Date; updatedAt: Date
  reviewStatus: ReviewStatus; isDraft: boolean; isFollowed?: boolean; needsMyReview?: boolean
  labels: string[]; comments: number
  ciDetails?: CiDetail[]
  needsRebase?: boolean
}

interface MockIssue {
  id: string; number: number; title: string; repo: string; url: string
  status: 'open' | 'closed'; author: string; authorAvatar: string
  assignees: Collaborator[]; labels: string[]; createdAt: Date; updatedAt: Date; comments: number
}

interface DayCommit { date: string; commits: number }

type SortKey = 'date' | 'status' | 'author' | 'repo' | 'files'
type SortDir = 'asc' | 'desc'
type InnerTab = 'prs' | 'issues' | 'waiting' | 'stats' | 'views'
// StatusFilter removed — now using multi-select sets

const PAGE_SIZE = 20
const REFRESH_INTERVAL = 60_000  // 1 minute

// ─── GitHub API helpers ───────────────────────────────────────────────────────

function ghHeaders(token?: string): HeadersInit {
  const h: HeadersInit = { Accept: 'application/vnd.github.v3+json' }
  if (token) (h as Record<string, string>)['Authorization'] = `token ${token}`
  return h
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ghFetch(url: string, token?: string): Promise<any> {
  const res = await fetch(url, { headers: ghHeaders(token) })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  return res.json()
}

/** Fetch full-year contribution calendar via GitHub GraphQL API */
async function ghFetchContributions(username: string, token: string): Promise<DayCommit[]> {
  const now = new Date()
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const query = `query($login:String!, $from:DateTime!, $to:DateTime!) {
    user(login:$login) {
      contributionsCollection(from:$from, to:$to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }`

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      variables: {
        login: username,
        from: oneYearAgo.toISOString(),
        to: now.toISOString(),
      },
    }),
  })

  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`)
  const json = await res.json()

  if (json.errors) {
    throw new Error(json.errors.map((e: { message: string }) => e.message).join(', '))
  }

  const weeks = json.data?.user?.contributionsCollection?.contributionCalendar?.weeks ?? []
  const days: DayCommit[] = []
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      days.push({ date: day.date, commits: day.contributionCount })
    }
  }
  return days
}

function parsePRStatus(pr: { state: string; draft: boolean; merged_at: string | null }): PRStatus {
  if (pr.merged_at) return 'merged'
  if (pr.draft) return 'draft'
  if (pr.state === 'closed') return 'closed'
  return 'open'
}

/** Extract repo name from various fields available in search results */
function extractRepoInfo(raw: any): { repo: string; repoUrl: string; fullName: string } {
  // Prefer base.repo (available on full PR objects)
  if (raw.base?.repo?.name) {
    return { repo: raw.base.repo.name, repoUrl: raw.base.repo.html_url ?? '', fullName: raw.base.repo.full_name ?? '' }
  }
  // Search API: extract from repository_url ("https://api.github.com/repos/owner/repo")
  if (raw.repository_url) {
    const parts = raw.repository_url.split('/')
    const repoName = parts[parts.length - 1] ?? 'unknown'
    const owner = parts[parts.length - 2] ?? ''
    return { repo: repoName, repoUrl: `https://github.com/${owner}/${repoName}`, fullName: `${owner}/${repoName}` }
  }
  // Fallback: extract from html_url ("https://github.com/owner/repo/pull/123")
  if (raw.html_url) {
    const match = raw.html_url.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (match) return { repo: match[2], repoUrl: `https://github.com/${match[1]}/${match[2]}`, fullName: `${match[1]}/${match[2]}` }
  }
  return { repo: 'unknown', repoUrl: '', fullName: 'unknown' }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawToMockPR(raw: any, currentUser: string): MockPR {
  const { repo, repoUrl, fullName } = extractRepoInfo(raw)
  return {
    id: `gh-pr-${raw.number}-${fullName || 'unknown'}`,
    number: raw.number, title: raw.title,
    repo, repoUrl, url: raw.html_url,
    status: parsePRStatus({ state: raw.state, draft: raw.draft, merged_at: raw.merged_at }),
    ciStatus: null,
    author: raw.user?.login ?? '—', authorAvatar: raw.user?.avatar_url ?? '',
    collaborators: (raw.requested_reviewers ?? []).map((r: { login: string; avatar_url: string }) => ({ login: r.login, avatar: r.avatar_url })),
    filesChanged: raw.changed_files ?? 0,
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    createdAt: new Date(raw.created_at), updatedAt: new Date(raw.updated_at),
    reviewStatus: 'pending', isDraft: raw.draft ?? false,
    needsMyReview: raw.state === 'open' && raw.user?.login !== currentUser &&
      (raw.requested_reviewers ?? []).some((r: { login: string }) => r.login === currentUser),
    labels: (raw.labels ?? []).map((l: { name: string }) => l.name),
    comments: raw.comments ?? 0,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawToMockIssue(raw: any): MockIssue {
  return {
    id: `gh-issue-${raw.number}-${raw.repository_url?.split('/repos/')[1] ?? ''}`,
    number: raw.number, title: raw.title,
    repo: raw.repository_url?.split('/').slice(-1)[0] ?? 'unknown',
    url: raw.html_url,
    status: raw.state === 'open' ? 'open' : 'closed',
    author: raw.user?.login ?? '—', authorAvatar: raw.user?.avatar_url ?? '',
    assignees: (raw.assignees ?? []).map((a: { login: string; avatar_url: string }) => ({ login: a.login, avatar: a.avatar_url })),
    labels: (raw.labels ?? []).map((l: { name: string }) => l.name),
    createdAt: new Date(raw.created_at), updatedAt: new Date(raw.updated_at),
    comments: raw.comments ?? 0,
  }
}

// ─── Mock / Fallback Data ─────────────────────────────────────────────────────

function daysAgo(n: number): Date { const d = new Date(); d.setDate(d.getDate() - n); return d }
function dateKey(d: Date): string { return d.toISOString().slice(0, 10) }

const AVATARS = [
  'https://avatars.githubusercontent.com/u/1?v=4',
  'https://avatars.githubusercontent.com/u/2?v=4',
  'https://avatars.githubusercontent.com/u/3?v=4',
  'https://avatars.githubusercontent.com/u/4?v=4',
  'https://avatars.githubusercontent.com/u/5?v=4',
]

const MOCK_PRS: MockPR[] = [
  { id:'pr-1', number:247, title:'feat: Add Launchpad page with PR overview', repo:'git-manager', repoUrl:'https://github.com/Tlahey/git-manager', url:'https://github.com/Tlahey/git-manager/pull/247', status:'open', ciStatus:'running', author:'antoine', authorAvatar:AVATARS[0], collaborators:[{login:'marie',avatar:AVATARS[1]}], filesChanged:12, additions:342, deletions:58, createdAt:daysAgo(1), updatedAt:daysAgo(0), reviewStatus:'pending', isDraft:false, needsMyReview:true, labels:['feature','ui'], comments:3, ciDetails: [
    { name: 'Build Desktop App', status: 'success' },
    { name: 'Run Unit Tests', status: 'running' },
    { name: 'ESLint & Prettier', status: 'success' },
  ] },
  { id:'pr-2', number:244, title:'fix: Memory leak in GraphRow', repo:'git-manager', repoUrl:'https://github.com/Tlahey/git-manager', url:'https://github.com/Tlahey/git-manager/pull/244', status:'approved', ciStatus:'success', author:'marie', authorAvatar:AVATARS[1], collaborators:[{login:'antoine',avatar:AVATARS[0]}], filesChanged:4, additions:23, deletions:67, createdAt:daysAgo(3), updatedAt:daysAgo(1), reviewStatus:'approved', isDraft:false, needsMyReview:false, labels:['bugfix'], comments:7, ciDetails: [
    { name: 'Build Desktop App', status: 'success' },
    { name: 'Run Unit Tests', status: 'success' },
    { name: 'ESLint & Prettier', status: 'success' },
  ] },
  { id:'pr-3', number:241, title:'chore: Bump Tauri to v2.2', repo:'git-manager', repoUrl:'https://github.com/Tlahey/git-manager', url:'https://github.com/Tlahey/git-manager/pull/241', status:'draft', ciStatus:'skipped', author:'lucas', authorAvatar:AVATARS[2], collaborators:[], filesChanged:8, additions:156, deletions:89, createdAt:daysAgo(5), updatedAt:daysAgo(2), reviewStatus:'pending', isDraft:true, needsMyReview:false, labels:['chore'], comments:0, ciDetails: [
    { name: 'Build Desktop App', status: 'skipped' },
    { name: 'Run Unit Tests', status: 'skipped' },
    { name: 'ESLint & Prettier', status: 'skipped' },
  ] },
  { id:'pr-4', number:238, title:'feat: GitHub OAuth integration', repo:'git-manager', repoUrl:'https://github.com/Tlahey/git-manager', url:'https://github.com/Tlahey/git-manager/pull/238', status:'changes_requested', ciStatus:'failure', author:'sophie', authorAvatar:AVATARS[3], collaborators:[{login:'antoine',avatar:AVATARS[0]}], filesChanged:23, additions:891, deletions:203, createdAt:daysAgo(7), updatedAt:daysAgo(1), reviewStatus:'changes_requested', isDraft:false, needsMyReview:true, labels:['feature','auth'], comments:14, needsRebase: true, ciDetails: [
    { name: 'Build Desktop App', status: 'failure' },
    { name: 'Run Unit Tests', status: 'success' },
    { name: 'ESLint & Prettier', status: 'success' },
  ] },
  { id:'pr-5', number:235, title:'refactor: Extract sidebar component', repo:'git-manager', repoUrl:'https://github.com/Tlahey/git-manager', url:'https://github.com/Tlahey/git-manager/pull/235', status:'open', ciStatus:'success', author:'antoine', authorAvatar:AVATARS[0], collaborators:[{login:'lucas',avatar:AVATARS[2]}], filesChanged:6, additions:112, deletions:98, createdAt:daysAgo(10), updatedAt:daysAgo(3), reviewStatus:'commented', isDraft:false, needsMyReview:false, labels:['refactor'], comments:5, ciDetails: [
    { name: 'Build Desktop App', status: 'success' },
    { name: 'Run Unit Tests', status: 'success' },
    { name: 'ESLint & Prettier', status: 'success' },
  ] },
  { id:'pr-6', number:230, title:'fix: Dark mode color tokens', repo:'analytics-lib', repoUrl:'https://github.com/Tlahey/analytics-lib', url:'https://github.com/Tlahey/analytics-lib/pull/230', status:'closed', ciStatus:'failure', author:'tom', authorAvatar:AVATARS[4], collaborators:[], filesChanged:2, additions:14, deletions:8, createdAt:daysAgo(14), updatedAt:daysAgo(10), reviewStatus:'pending', isDraft:false, needsMyReview:false, labels:['bugfix','ui'], comments:2, ciDetails: [
    { name: 'Build Desktop App', status: 'failure' },
    { name: 'Run Unit Tests', status: 'failure' },
    { name: 'ESLint & Prettier', status: 'success' },
  ] },
]

const MOCK_ISSUES: MockIssue[] = [
  { id:'issue-1', number:312, title:'Tab close button overlaps text on narrow screens', repo:'git-manager', url:'https://github.com/Tlahey/git-manager/issues/312', status:'open', author:'sophie', authorAvatar:AVATARS[3], assignees:[{login:'antoine',avatar:AVATARS[0]}], labels:['bug','ui'], createdAt:daysAgo(2), updatedAt:daysAgo(0), comments:3 },
  { id:'issue-2', number:308, title:'Graph line glitches on Retina displays', repo:'git-manager', url:'https://github.com/Tlahey/git-manager/issues/308', status:'open', author:'tom', authorAvatar:AVATARS[4], assignees:[{login:'marie',avatar:AVATARS[1]}], labels:['bug','performance'], createdAt:daysAgo(5), updatedAt:daysAgo(2), comments:7 },
  { id:'issue-3', number:301, title:'Add keyboard shortcuts for common operations', repo:'git-manager', url:'https://github.com/Tlahey/git-manager/issues/301', status:'open', author:'marie', authorAvatar:AVATARS[1], assignees:[], labels:['enhancement','ux'], createdAt:daysAgo(8), updatedAt:daysAgo(3), comments:12 },
  { id:'issue-4', number:298, title:'Support SSH key passphrase on clone', repo:'git-manager', url:'https://github.com/Tlahey/git-manager/issues/298', status:'closed', author:'lucas', authorAvatar:AVATARS[2], assignees:[{login:'antoine',avatar:AVATARS[0]}], labels:['feature','security'], createdAt:daysAgo(12), updatedAt:daysAgo(5), comments:4 },
]

// ─── useGitHubData ────────────────────────────────────────────────────────────

interface GitHubData {
  prs: MockPR[]; issues: MockIssue[]; commitDays: DayCommit[]; yearDays: DayCommit[]
  loading: boolean; error: string | null; hasToken: boolean; username: string | null
  lastRefreshed: Date | null; refresh: () => void
}

function useGitHubData(): GitHubData {
  const githubSettings = useSettingsStore(s => s.settings.github)
  const activeAccount = githubSettings?.accounts?.find(a => a.id === githubSettings.activeAccountId) ?? null
  const token = activeAccount?.token ?? null
  const username = activeAccount?.user?.login ?? null

  const [prs, setPrs] = useState<MockPR[]>((token && username) ? [] : MOCK_PRS)
  const [issues, setIssues] = useState<MockIssue[]>((token && username) ? [] : MOCK_ISSUES)
  const [commitDays, setCommitDays] = useState<DayCommit[]>([])
  const [yearDays, setYearDays] = useState<DayCommit[]>([])
  const [loading, setLoading] = useState(!!token && !!username)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const hasToken = !!token && !!username

  const refresh = useCallback(() => setRefreshTick(t => t + 1), [])

  // Auto-refresh every minute
  useEffect(() => {
    const timer = setInterval(refresh, REFRESH_INTERVAL)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!token || !username) {
      setPrs(MOCK_PRS)
      setIssues(MOCK_ISSUES)
      const fakeYear: DayCommit[] = Array.from({ length: 365 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (364 - i))
        const dow = d.getDay()
        const commits = (dow === 0 || dow === 6)
          ? (Math.random() < 0.3 ? Math.floor(Math.random() * 4) : 0)
          : (Math.random() < 0.7 ? Math.floor(Math.random() * 10) + 1 : 0)
        return { date: dateKey(d), commits }
      })
      setYearDays(fakeYear)
      setCommitDays(fakeYear.slice(-14))
      setLastRefreshed(new Date())
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const [prSearch, reviewSearch, issueSearch] = await Promise.all([
          ghFetch(`https://api.github.com/search/issues?q=is:pr+author:${username}+is:open&per_page=50&sort=updated`, token!),
          ghFetch(`https://api.github.com/search/issues?q=is:pr+review-requested:${username}+is:open&per_page=50&sort=updated`, token!),
          ghFetch(`https://api.github.com/search/issues?q=is:issue+assignee:${username}&per_page=50&sort=updated`, token!),
        ])
        if (cancelled) return

        const prMap = new Map<string, MockPR>()
        for (const raw of prSearch.items ?? []) { const p = rawToMockPR(raw, username!); prMap.set(p.id, p) }
        for (const raw of reviewSearch.items ?? []) { const p = rawToMockPR(raw, username!); p.needsMyReview = true; prMap.set(p.id, p) }

        // Enrich PRs with full details (additions/deletions/changed_files)
        // The Search API returns pull_request.url pointing to the full PR endpoint
        const enrichPromises = [...prMap.values()].map(async (pr) => {
          // Find the raw item to get the pull_request.url
          const allRawItems = [...(prSearch.items ?? []), ...(reviewSearch.items ?? [])]
          const rawItem = allRawItems.find((r: any) =>
            r.number === pr.number && pr.id.includes(r.repository_url?.split('/').slice(-2).join('/') ?? '__')
          )
          const prApiUrl = rawItem?.pull_request?.url
          if (!prApiUrl) return pr
          try {
            const full = await ghFetch(prApiUrl, token!)
            pr.additions = full.additions ?? 0
            pr.deletions = full.deletions ?? 0
            pr.filesChanged = full.changed_files ?? pr.filesChanged

            // Check if PR needs rebase
            pr.needsRebase = (full.mergeable === false) || (full.mergeable_state === 'behind')

            // Fetch CI status
            const owner = full.base?.repo?.owner?.login
            const repo = full.base?.repo?.name
            const sha = full.head?.sha
            if (owner && repo && sha) {
              const [checkRunsRes, statusRes] = await Promise.all([
                ghFetch(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs`, token!).catch(() => null),
                ghFetch(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`, token!).catch(() => null)
              ])

              const checkRuns = checkRunsRes?.check_runs ?? []
              const totalCheckRuns = checkRunsRes?.total_count ?? 0
              const statuses = statusRes?.statuses ?? []
              const commitStatusState = statusRes?.state
              const totalStatuses = statusRes?.total_count ?? 0

              const hasCheckRuns = totalCheckRuns > 0
              const hasStatuses = totalStatuses > 0

              let resolvedCiStatus: CiStatus = null

              if (hasCheckRuns || hasStatuses) {
                const hasFailure = (hasCheckRuns && checkRuns.some((run: any) =>
                  ['failure', 'timed_out', 'cancelled'].includes(run.conclusion)
                )) || (hasStatuses && ['failure', 'error'].includes(commitStatusState))

                if (hasFailure) {
                  resolvedCiStatus = 'failure'
                } else {
                  const hasRunning = (hasCheckRuns && checkRuns.some((run: any) =>
                    ['in_progress', 'queued'].includes(run.status)
                  )) || (hasStatuses && commitStatusState === 'pending')

                  if (hasRunning) {
                    resolvedCiStatus = 'running'
                  } else {
                    const hasSuccess = (hasCheckRuns && checkRuns.some((run: any) =>
                      run.conclusion === 'success'
                    )) || (hasStatuses && commitStatusState === 'success')

                    if (hasSuccess) {
                      resolvedCiStatus = 'success'
                    } else {
                      const allSkipped = hasCheckRuns && checkRuns.every((run: any) =>
                        ['skipped', 'neutral'].includes(run.conclusion)
                      )
                      resolvedCiStatus = allSkipped ? 'skipped' : null
                    }
                  }
                }

                // Construct detailed check runs list
                const checkRunsDetails: CiDetail[] = checkRuns.map((run: any) => {
                  let s: CiDetail['status'] = 'unknown'
                  if (run.status === 'in_progress' || run.status === 'queued') {
                    s = 'running'
                  } else if (run.status === 'completed') {
                    if (run.conclusion === 'success') s = 'success'
                    else if (['failure', 'timed_out', 'cancelled'].includes(run.conclusion)) s = 'failure'
                    else if (['skipped', 'neutral'].includes(run.conclusion)) s = 'skipped'
                  }
                  return {
                    name: run.name ?? 'Check run',
                    status: s,
                    url: run.html_url
                  }
                })

                const statusesDetails: CiDetail[] = statuses.map((status: any) => {
                  let s: CiDetail['status'] = 'unknown'
                  if (status.state === 'success') s = 'success'
                  else if (['failure', 'error'].includes(status.state)) s = 'failure'
                  else if (status.state === 'pending') s = 'running'
                  return {
                    name: status.context ?? 'Status check',
                    status: s,
                    url: status.target_url
                  }
                })

                pr.ciDetails = [...checkRunsDetails, ...statusesDetails]
              }
              pr.ciStatus = resolvedCiStatus
            }
          } catch { /* keep defaults */ }
          return pr
        })
        await Promise.all(enrichPromises)

        setPrs([...prMap.values()])
        setIssues((issueSearch.items ?? []).map(rawToMockIssue))

        // Contribution heatmap via GraphQL (full year)
        try {
          const contributionDays = await ghFetchContributions(username!, token!)
          if (!cancelled) {
            setYearDays(contributionDays)
            setCommitDays(contributionDays.slice(-14))
          }
        } catch {
          // Fallback: fill with zeros if GraphQL fails (e.g. token without read:user scope)
          if (!cancelled) {
            const fill365: DayCommit[] = Array.from({ length: 365 }, (_, i) => {
              const d = new Date(); d.setDate(d.getDate() - (364 - i))
              return { date: dateKey(d), commits: 0 }
            })
            setYearDays(fill365)
            setCommitDays(fill365.slice(-14))
          }
        }
        setLastRefreshed(new Date())
      } catch (e) {
        if (!cancelled) { setError(String(e)); setLastRefreshed(new Date()) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [token, username, refreshTick])

  return { prs, issues, commitDays, yearDays, loading, error, hasToken, username, lastRefreshed, refresh }
}

// ─── Filter matching ──────────────────────────────────────────────────────────

function matchesPR(pr: MockPR, f: SavedFilter): boolean {
  if (f.titleContains && !pr.title.toLowerCase().includes(f.titleContains.toLowerCase())) return false
  if (f.authorContains && !pr.author.toLowerCase().includes(f.authorContains.toLowerCase())) return false
  if (f.repo && pr.repo !== f.repo) return false
  if (f.labelContains && !pr.labels.some(l => l.toLowerCase().includes(f.labelContains!.toLowerCase()))) return false
  if (f.statuses && f.statuses.length > 0 && !f.statuses.includes(pr.status as FilterStatus)) return false
  if (f.needsMyReview === true && !pr.needsMyReview) return false
  return true
}

function matchesIssue(issue: MockIssue, f: SavedFilter): boolean {
  if (f.titleContains && !issue.title.toLowerCase().includes(f.titleContains.toLowerCase())) return false
  if (f.authorContains && !issue.author.toLowerCase().includes(f.authorContains.toLowerCase())) return false
  if (f.repo && issue.repo !== f.repo) return false
  if (f.labelContains && !issue.labels.some(l => l.toLowerCase().includes(f.labelContains!.toLowerCase()))) return false
  return true
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openUrl(url: string) {
  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch { window.open(url, '_blank') }
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

function parseFollowedPR(url: string): MockPR | null {
  const match = url.match(/\/pull\/(\d+)$/)
  if (!match) return null
  const repoMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\//)
  const repo = repoMatch ? repoMatch[2] : 'unknown'
  return {
    id: `followed-${url}`, number: parseInt(match[1]), title: `PR #${match[1]} — ${repo}`,
    repo, repoUrl: url.split('/pull/')[0], url,
    status: 'open', ciStatus: null, author: '—', authorAvatar: AVATARS[0],
    collaborators: [], filesChanged: 0, additions: 0, deletions: 0,
    createdAt: new Date(), updatedAt: new Date(),
    reviewStatus: 'pending', isDraft: false, isFollowed: true, labels: [], comments: 0,
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<PRStatus, { label: string; className: string }> = {
  open:               { label: 'Open',     className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  draft:              { label: 'Draft',    className: 'bg-muted text-muted-foreground border-border' },
  approved:           { label: 'Approved', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  changes_requested:  { label: 'Changes',  className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  merged:             { label: 'Merged',   className: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  closed:             { label: 'Closed',   className: 'bg-destructive/15 text-destructive border-destructive/30' },
}

function StatusBadge({ status }: { status: PRStatus }) {
  const cfg = STATUS_CONFIG[status]
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cfg.className}`}>{cfg.label}</span>
}

function CiBadge({ status, details }: { status: CiStatus; details?: CiDetail[] }) {
  let badgeEl = <span className="text-[9px] text-muted-foreground/40">—</span>

  if (status === 'success') {
    badgeEl = <span className="flex items-center gap-0.5 text-[9px] text-green-400 cursor-help"><CheckCircle2 className="h-3 w-3" />Pass</span>
  } else if (status === 'failure') {
    badgeEl = <span className="flex items-center gap-0.5 text-[9px] text-red-400 cursor-help"><XCircle className="h-3 w-3" />Fail</span>
  } else if (status === 'running') {
    badgeEl = <span className="flex items-center gap-0.5 text-[9px] text-amber-400 cursor-help"><Loader2 className="h-3 w-3 animate-spin" />Running</span>
  } else if (status === 'skipped') {
    badgeEl = <span className="text-[9px] text-muted-foreground/40 cursor-help">Skip</span>
  }

  if (details && details.length > 0) {
    const tooltipContent = (
      <div className="flex flex-col gap-1 p-1 max-w-[280px]">
        <div className="font-bold text-[10px] text-muted-foreground/85 border-b border-border/40 pb-1 mb-1.5 flex items-center justify-between">
          <span>CI Check Steps</span>
          <span className="text-[8px] opacity-60 normal-case font-normal">hover to see status</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {details.map((d, idx) => (
            <div key={idx} className="flex items-center justify-between gap-4 text-[10px]">
              <div className="flex items-center gap-1.5 min-w-0">
                {d.status === 'success' && <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />}
                {d.status === 'failure' && <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                {d.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-amber-400 shrink-0" />}
                {d.status === 'skipped' && <Circle className="h-3 w-3 text-muted-foreground/30 shrink-0" />}
                {d.status === 'unknown' && <Circle className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                <span className="truncate text-foreground/90 font-medium">{d.name}</span>
              </div>
              <span className="text-[9px] uppercase font-semibold text-muted-foreground/60 shrink-0">{d.status}</span>
            </div>
          ))}
        </div>
      </div>
    )

    return (
      <Tooltip content={tooltipContent} className="whitespace-normal min-w-[220px]">
        {badgeEl}
      </Tooltip>
    )
  }

  return badgeEl
}

function PRRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 last:border-0 animate-pulse">
      <div className="w-3 h-3 rounded-full bg-muted/60 shrink-0" />
      <div className="w-4 h-4 rounded bg-muted/60 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-2/3 bg-muted/80 rounded" />
        <div className="flex gap-2">
          <div className="h-2 w-16 bg-muted/40 rounded" />
          <div className="h-2.5 w-12 bg-muted/40 rounded" />
        </div>
      </div>
      <div className="w-[52px] h-2.5 bg-muted/40 rounded shrink-0" />
      <div className="w-[80px] flex justify-center shrink-0">
        <div className="w-14 h-4 bg-muted/60 rounded" />
      </div>
      <div className="w-[90px] flex items-center gap-1.5 shrink-0">
        <div className="w-[18px] h-[18px] rounded-full bg-muted/60" />
        <div className="h-2 w-12 bg-muted/40 rounded" />
      </div>
      <div className="w-[60px] flex justify-center shrink-0">
        <div className="w-[18px] h-[18px] rounded-full bg-muted/40" />
      </div>
      <div className="w-[110px] shrink-0">
        <div className="h-2 w-16 bg-muted/40 rounded" />
      </div>
      <div className="w-[60px] flex justify-center shrink-0">
        <div className="w-8 h-2.5 bg-muted/40 rounded" />
      </div>
      <div className="w-6 h-6 rounded bg-muted/30 shrink-0" />
    </div>
  )
}

function IssueRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 last:border-0 animate-pulse">
      <div className="w-4 h-4 rounded bg-muted/60 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3 w-1/2 bg-muted/80 rounded" />
        <div className="flex gap-2">
          <div className="h-2.5 w-12 bg-muted/40 rounded" />
          <div className="h-2 w-6 bg-muted/40 rounded" />
        </div>
      </div>
      <div className="w-[52px] h-2.5 bg-muted/40 rounded shrink-0" />
      <div className="w-[70px] flex justify-center shrink-0">
        <div className="w-12 h-4 bg-muted/60 rounded" />
      </div>
      <div className="w-[90px] flex items-center gap-1.5 shrink-0">
        <div className="w-[18px] h-[18px] rounded-full bg-muted/60" />
        <div className="h-2 w-12 bg-muted/40 rounded" />
      </div>
      <div className="w-[60px] flex justify-center shrink-0">
        <div className="w-[18px] h-[18px] rounded-full bg-muted/40" />
      </div>
      <div className="w-[110px] shrink-0">
        <div className="h-2 w-16 bg-muted/40 rounded" />
      </div>
      <div className="w-6 h-6 rounded bg-muted/30 shrink-0" />
    </div>
  )
}

function AvatarStack({ users, max = 3 }: { users: Collaborator[]; max?: number }) {
  const shown = users.slice(0, max); const extra = users.length - max
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map(u => <img key={u.login} src={u.avatar} alt={u.login} title={u.login} className="rounded-full border border-border bg-muted object-cover" style={{ width: 18, height: 18 }} />)}
      {extra > 0 && <span className="flex items-center justify-center rounded-full border border-border bg-muted text-[8px] text-muted-foreground" style={{ width: 18, height: 18 }}>+{extra}</span>}
    </div>
  )
}

function KpiCard({ icon, label, value, sub, accent, loading }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string; loading?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border border-border bg-card/60 px-4 py-3 backdrop-blur-sm shadow-sm flex-1 min-w-0 transition-all hover:border-border/80 hover:shadow-md ${accent ?? ''}`}>
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-[10px] font-medium uppercase tracking-wider">{label}</span></div>
      {loading ? (
        <div className="h-6 w-12 bg-muted/60 animate-pulse rounded my-1" />
      ) : (
        <span className="text-2xl font-bold text-foreground leading-none">{value}</span>
      )}
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  )
}

function InnerTab({ active, onClick, children, count, loading }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number; loading?: boolean }) {
  return (
    <button onClick={onClick} className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}`}>
      {children}
      {count !== undefined && (
        loading ? (
          <span className="w-5 h-3.5 rounded-full bg-muted/65 animate-pulse" />
        ) : (
          <span className={`rounded-full px-1.5 py-px text-[9px] font-semibold leading-none ${active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>{count}</span>
        )
      )}
    </button>
  )
}

// ─── Multi-Select Dropdown Filter ─────────────────────────────────────────────

function MultiSelectDropdown({ label, icon, options, selected, onToggle, onClear }: {
  label: string; icon: React.ReactNode; options: string[]; selected: Set<string>
  onToggle: (value: string) => void; onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const activeCount = selected.size

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium transition-all duration-150 ${
          activeCount > 0
            ? 'bg-primary/10 border-primary/30 text-primary shadow-sm shadow-primary/5'
            : open
              ? 'bg-accent/60 border-border/80 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/30'
        }`}
      >
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
        {activeCount > 0 && (
          <span className="flex items-center justify-center min-w-[16px] h-4 rounded-full bg-primary/20 text-primary text-[9px] font-bold px-1 leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`h-2.5 w-2.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] max-h-[280px] rounded-lg border border-border bg-popover shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Header with clear button */}
          {activeCount > 0 && (
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/10">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{activeCount} selected</span>
              <button onClick={(e) => { e.stopPropagation(); onClear() }}
                className="text-[9px] text-muted-foreground/60 hover:text-primary underline transition-colors"
              >Clear all</button>
            </div>
          )}

          {/* Options list */}
          <div className="overflow-y-auto max-h-[240px] py-1">
            {options.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-muted-foreground/50 text-center italic">No options available</div>
            ) : options.map(opt => {
              const isActive = selected.has(opt)
              return (
                <button key={opt} onClick={() => onToggle(opt)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-colors hover:bg-accent/50 group/opt"
                >
                  <div className={`flex items-center justify-center w-3.5 h-3.5 rounded border transition-all duration-100 ${
                    isActive
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border/80 bg-transparent group-hover/opt:border-muted-foreground/50'
                  }`}>
                    {isActive && <CheckCircle2 className="h-2.5 w-2.5" />}
                  </div>
                  <span className={`truncate transition-colors ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{opt}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

interface ToolbarProps {
  search: string; onSearch: (v: string) => void
  sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void
  statusFilter: Set<string>; onToggleStatus: (s: string) => void; onClearStatus: () => void
  repoFilter: Set<string>; onToggleRepo: (r: string) => void; onClearRepo: () => void
  authorFilter: Set<string>; onToggleAuthor: (a: string) => void; onClearAuthor: () => void
  repos: string[]; statuses: string[]; authors: string[]
}

function Toolbar({ search, onSearch, sortKey, sortDir, onSort, statusFilter, onToggleStatus, onClearStatus, repoFilter, onToggleRepo, onClearRepo, authorFilter, onToggleAuthor, onClearAuthor, repos, statuses, authors }: ToolbarProps) {
  const totalActiveFilters = statusFilter.size + repoFilter.size + authorFilter.size
  function clearAll() { onClearStatus(); onClearRepo(); onClearAuthor() }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/5 shrink-0">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <input type="text" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search…"
          className="w-full pl-7 pr-6 h-7 rounded-md border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        {search && <button onClick={() => onSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
      </div>

      {/* Separator */}
      <div className="h-4 w-px bg-border/60 mx-0.5" />

      {/* Quick filter dropdowns */}
      <MultiSelectDropdown label="Repo" icon={<Layers className="h-3 w-3" />} options={repos} selected={repoFilter} onToggle={onToggleRepo} onClear={onClearRepo} />
      <MultiSelectDropdown label="Status" icon={<Circle className="h-3 w-3" />} options={statuses} selected={statusFilter} onToggle={onToggleStatus} onClear={onClearStatus} />
      <MultiSelectDropdown label="Author" icon={<Pencil className="h-3 w-3" />} options={authors} selected={authorFilter} onToggle={onToggleAuthor} onClear={onClearAuthor} />

      {/* Clear all badge */}
      {totalActiveFilters > 0 && (
        <button onClick={clearAll}
          className="flex items-center gap-1 h-6 px-2 rounded-md text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/5 border border-transparent hover:border-destructive/20 transition-all"
        >
          <X className="h-2.5 w-2.5" /> Clear all ({totalActiveFilters})
        </button>
      )}

      {/* Separator */}
      <div className="h-4 w-px bg-border/60 mx-0.5" />

      {/* Sort buttons */}
      <div className="flex items-center gap-1">
        {(['date','status','author','repo','files'] as SortKey[]).map(k => (
          <button key={k} onClick={() => onSort(k)}
            className={`flex items-center gap-1 h-7 px-2 rounded border text-[10px] transition-colors ${sortKey === k ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            {k === 'date' ? 'Date' : k === 'status' ? 'Status' : k === 'author' ? 'Author' : k === 'repo' ? 'Repo' : 'Files'}
            {sortKey === k && <ArrowUpDown className="h-2.5 w-2.5" style={{ transform: sortDir === 'asc' ? 'scaleY(1)' : 'scaleY(-1)' }} />}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Action Menu ──────────────────────────────────────────────────────────────

function ActionMenu({ items, onClose }: { items: { label: string; icon: React.ReactNode; action: () => void }[]; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-popover shadow-xl py-1 overflow-hidden">
        {items.map(item => <button key={item.label} onClick={() => { item.action(); onClose() }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"><span className="text-muted-foreground">{item.icon}</span>{item.label}</button>)}
      </div>
    </>
  )
}

function TableHeader() {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/10 border-b border-border text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 shrink-0">
      <div className="w-3 shrink-0" /><div className="w-4 shrink-0" />
      <div className="flex-1 min-w-0">Item</div>
      <div className="shrink-0 w-[52px] text-right">Updated</div>
      <div className="shrink-0 w-[80px] text-center">Status</div>
      <div className="shrink-0 w-[90px]">Author</div>
      <div className="shrink-0 w-[60px] text-center">With</div>
      <div className="shrink-0 w-[110px]">Repo</div>
      <div className="shrink-0 w-[60px] text-center">CI</div>
      <div className="shrink-0 w-6" />
    </div>
  )
}

function GroupHeader({ label, count, open, onToggle, accent }: { label: string; count: number; open: boolean; onToggle: () => void; accent?: string }) {
  return (
    <button onClick={onToggle} className="flex w-full items-center gap-2 px-4 py-2 bg-muted/20 hover:bg-muted/30 transition-colors border-b border-border/50 shrink-0">
      {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${accent ?? 'text-muted-foreground'}`}>{label}</span>
      <span className={`rounded-full px-1.5 py-px text-[9px] font-bold leading-none ${accent ? 'bg-amber-500/20 text-amber-400' : 'bg-muted text-muted-foreground'}`}>{count}</span>
    </button>
  )
}

function LoadMore({ total, shown, onLoadMore }: { total: number; shown: number; onLoadMore: () => void }) {
  if (shown >= total) return null
  return (
    <div className="flex items-center justify-center py-3 border-t border-border/30 shrink-0">
      <button onClick={onLoadMore} className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground border border-border hover:border-border/80 hover:bg-accent/40 rounded-lg px-4 py-1.5 transition-colors">
        <RefreshCw className="h-3 w-3" /> Load more ({total - shown} remaining)
      </button>
    </div>
  )
}

// ─── PR Row ───────────────────────────────────────────────────────────────────

function PRRow({ pr, pinned, onTogglePin }: { pr: MockPR; pinned: boolean; onTogglePin: (id: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="group/pr relative flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors cursor-pointer border-b border-border/30 last:border-0" onClick={() => openUrl(pr.url)}>
      <button onClick={e => { e.stopPropagation(); onTogglePin(pr.id) }} title={pinned ? 'Unpin' : 'Pin'} className={`shrink-0 transition-colors ${pinned ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-400'}`}>
        <Pin className={`h-3 w-3 ${pinned ? 'fill-amber-400' : ''}`} />
      </button>
      <div className="shrink-0">
        {pr.status === 'merged' ? <GitMerge className="h-4 w-4 text-purple-400" /> : pr.status === 'closed' ? <XCircle className="h-4 w-4 text-destructive" /> : pr.isDraft ? <Circle className="h-4 w-4 text-muted-foreground" /> : <GitPullRequest className="h-4 w-4 text-green-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground group-hover/pr:text-primary transition-colors truncate">{pr.title}</span>
          <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">#{pr.number}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {(pr.additions > 0 || pr.deletions > 0) ? (
            <span className="text-[10px] font-mono text-muted-foreground/60 flex items-center gap-1">
              <span className="text-green-400">+{pr.additions}</span>
              <span className="text-red-400">−{pr.deletions}</span>
              {pr.filesChanged > 0 && <span className="text-muted-foreground/40">· {pr.filesChanged} files</span>}
            </span>
          ) : pr.filesChanged > 0 ? (
            <span className="text-[10px] font-mono text-muted-foreground/60">{pr.filesChanged} files</span>
          ) : null}
          {pr.labels.slice(0, 2).map(l => <span key={l} className="text-[9px] bg-muted/60 text-muted-foreground border border-border/50 rounded px-1 py-px">{l}</span>)}
          {pr.needsRebase && (
            <span className="text-[9px] bg-amber-500/15 text-amber-500 border border-amber-500/35 rounded px-1 py-0.5 flex items-center gap-0.5 font-medium shrink-0">
              <AlertCircle className="h-2.5 w-2.5 text-amber-500" /> Rebase required
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-[10px] text-muted-foreground min-w-[52px] text-right">{timeAgo(pr.updatedAt)}</div>
      <div className="shrink-0 w-[80px] flex justify-center"><StatusBadge status={pr.status} /></div>
      <div className="shrink-0 flex items-center gap-1.5 w-[90px]">
        <img src={pr.authorAvatar} alt={pr.author} className="rounded-full bg-muted border border-border object-cover" style={{ width: 18, height: 18 }} />
        <span className="text-[10px] text-muted-foreground truncate">{pr.author}</span>
      </div>
      <div className="shrink-0 w-[60px] flex justify-center">{pr.collaborators.length > 0 ? <AvatarStack users={pr.collaborators} max={3} /> : <span className="text-muted-foreground/30 text-[10px]">—</span>}</div>
      <div className="shrink-0 w-[110px]"><span className="text-[10px] font-mono text-muted-foreground/70 truncate block">{pr.repo}</span></div>
      <div className="shrink-0 w-[60px] flex justify-center"><CiBadge status={pr.ciStatus} details={pr.ciDetails} /></div>
      <div className="shrink-0 relative" onClick={e => e.stopPropagation()}>
        <button onClick={() => setMenuOpen(v => !v)} className="h-6 w-6 flex items-center justify-center rounded border border-transparent hover:border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"><MoreHorizontal className="h-3.5 w-3.5" /></button>
        {menuOpen && <ActionMenu items={[
          { label: 'Open on GitHub', icon: <ExternalLink className="h-3 w-3" />, action: () => openUrl(pr.url) },
          { label: 'Copy link', icon: <Link className="h-3 w-3" />, action: () => navigator.clipboard.writeText(pr.url) },
          { label: pinned ? 'Unpin' : 'Pin', icon: <Pin className="h-3 w-3" />, action: () => onTogglePin(pr.id) },
        ]} onClose={() => setMenuOpen(false)} />}
      </div>
    </div>
  )
}

// ─── Issue Row ────────────────────────────────────────────────────────────────

function IssueRow({ issue }: { issue: MockIssue }) {
  return (
    <div className="group/issue flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors cursor-pointer border-b border-border/30 last:border-0" onClick={() => openUrl(issue.url)}>
      <div className="shrink-0">{issue.status === 'closed' ? <CheckCircle2 className="h-4 w-4 text-purple-400" /> : <AlertCircle className="h-4 w-4 text-green-400" />}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground group-hover/issue:text-primary transition-colors truncate">{issue.title}</span>
          <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">#{issue.number}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {issue.labels.map(l => <span key={l} className="text-[9px] bg-muted/60 text-muted-foreground border border-border/50 rounded px-1 py-px">{l}</span>)}
          <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{issue.comments}</span>
        </div>
      </div>
      <div className="shrink-0 text-[10px] text-muted-foreground min-w-[52px] text-right">{timeAgo(issue.updatedAt)}</div>
      <div className="shrink-0 w-[70px] flex justify-center">
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${issue.status === 'open' ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-purple-500/15 text-purple-400 border-purple-500/30'}`}>{issue.status}</span>
      </div>
      <div className="shrink-0 flex items-center gap-1.5 w-[90px]">
        <img src={issue.authorAvatar} alt={issue.author} className="rounded-full bg-muted border border-border object-cover" style={{ width: 18, height: 18 }} />
        <span className="text-[10px] text-muted-foreground truncate">{issue.author}</span>
      </div>
      <div className="shrink-0 w-[60px] flex justify-center">{issue.assignees.length > 0 ? <AvatarStack users={issue.assignees} max={3} /> : <span className="text-muted-foreground/30 text-[10px]">—</span>}</div>
      <div className="shrink-0 w-[110px]"><span className="text-[10px] font-mono text-muted-foreground/70 truncate block">{issue.repo}</span></div>
      <div className="shrink-0 w-6 flex justify-center"><ExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover/issue:text-muted-foreground transition-colors" /></div>
    </div>
  )
}

// ─── Follow PR Dialog ─────────────────────────────────────────────────────────

function FollowPRDialog({ onAdd, onClose }: { onAdd: (url: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const isValid = url.includes('github.com') && url.includes('/pull/')
  function handleAdd() { if (isValid) { onAdd(url.trim()); onClose() } }
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] rounded-xl border border-border bg-card shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Follow a Pull Request</h2></div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <input type="url" value={url} autoFocus onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="https://github.com/owner/repo/pull/123"
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Cancel</button>
          <button onClick={handleAdd} disabled={!isValid} className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors">Follow PR</button>
        </div>
      </div>
    </>
  )
}

// ─── usePRSort ────────────────────────────────────────────────────────────────

function usePRSort(prs: MockPR[], sortKey: SortKey, sortDir: SortDir): MockPR[] {
  return useMemo(() => [...prs].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'date') cmp = a.updatedAt.getTime() - b.updatedAt.getTime()
    else if (sortKey === 'status') cmp = a.status.localeCompare(b.status)
    else if (sortKey === 'author') cmp = a.author.localeCompare(b.author)
    else if (sortKey === 'repo') cmp = a.repo.localeCompare(b.repo)
    else if (sortKey === 'files') cmp = a.filesChanged - b.filesChanged
    return sortDir === 'desc' ? -cmp : cmp
  }), [prs, sortKey, sortDir])
}

// ─── Multi-select filter toggle helper ────────────────────────────────────────

function useSetFilter(): [Set<string>, (v: string) => void, () => void] {
  const [set, setSet] = useState<Set<string>>(new Set())
  const toggle = useCallback((v: string) => setSet(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n }), [])
  const clear = useCallback(() => setSet(new Set()), [])
  return [set, toggle, clear]
}

// ─── Pull Requests Tab ────────────────────────────────────────────────────────

function PullRequestsTab({ allPRs, followedPRs, pinnedIds, onTogglePin, onAddFollowed, onRemoveFollowed, loading }: {
  allPRs: MockPR[]; followedPRs: MockPR[]; pinnedIds: Set<string>
  onTogglePin: (id: string) => void; onAddFollowed: (pr: MockPR) => void; onRemoveFollowed: (id: string) => void
  loading: boolean
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter()
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()
  const [gNeedsOpen, setGNeedsOpen] = useState(true)
  const [gOtherOpen, setGOtherOpen] = useState(true)
  const [gPinnedOpen, setGPinnedOpen] = useState(true)
  const [gFollowedOpen, setGFollowedOpen] = useState(true)
  const [shownNeeds, setShownNeeds] = useState(PAGE_SIZE)
  const [shownOther, setShownOther] = useState(PAGE_SIZE)
  const [showFollowDialog, setShowFollowDialog] = useState(false)

  function handleSort(k: SortKey) {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const combined = useMemo(() => [...allPRs, ...followedPRs], [allPRs, followedPRs])
  const repos = useMemo(() => [...new Set(combined.map(p => p.repo))].sort(), [combined])
  const statuses = useMemo(() => [...new Set(combined.map(p => p.status))].sort(), [combined])
  const authors = useMemo(() => [...new Set(combined.map(p => p.author))].sort(), [combined])
  const filtered = useMemo(() => combined.filter(pr => {
    if (statusFilter.size > 0 && !statusFilter.has(pr.status)) return false
    if (repoFilter.size > 0 && !repoFilter.has(pr.repo)) return false
    if (authorFilter.size > 0 && !authorFilter.has(pr.author)) return false
    if (search) { const q = search.toLowerCase(); return pr.title.toLowerCase().includes(q) || pr.author.toLowerCase().includes(q) || pr.repo.toLowerCase().includes(q) || String(pr.number).includes(q) }
    return true
  }), [combined, search, statusFilter, repoFilter, authorFilter])

  const pinnedPRs = usePRSort(filtered.filter(pr => pinnedIds.has(pr.id)), sortKey, sortDir)
  const followedFiltered = usePRSort(filtered.filter(pr => pr.isFollowed && !pinnedIds.has(pr.id)), sortKey, sortDir)
  const needsReview = usePRSort(filtered.filter(pr => pr.needsMyReview && !pinnedIds.has(pr.id) && !pr.isFollowed), sortKey, sortDir)
  const other = usePRSort(filtered.filter(pr => !pr.needsMyReview && !pinnedIds.has(pr.id) && !pr.isFollowed), sortKey, sortDir)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Toolbar search={search} onSearch={setSearch} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} statusFilter={statusFilter} onToggleStatus={toggleStatus} onClearStatus={clearStatus} repoFilter={repoFilter} onToggleRepo={toggleRepo} onClearRepo={clearRepo} authorFilter={authorFilter} onToggleAuthor={toggleAuthor} onClearAuthor={clearAuthor} repos={repos} statuses={statuses} authors={authors} />
      <TableHeader />
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <PRRowSkeleton />
            <PRRowSkeleton />
            <PRRowSkeleton />
            <PRRowSkeleton />
          </>
        ) : (
          <>
            {pinnedPRs.length > 0 && (<>
              <GroupHeader label="Pinned" count={pinnedPRs.length} open={gPinnedOpen} onToggle={() => setGPinnedOpen(v => !v)} accent="text-amber-400" />
              {gPinnedOpen && pinnedPRs.map(pr => <PRRow key={pr.id} pr={pr} pinned onTogglePin={onTogglePin} />)}
            </>)}
            <GroupHeader label="Needs my review" count={needsReview.length} open={gNeedsOpen} onToggle={() => setGNeedsOpen(v => !v)} accent="text-orange-400" />
            {gNeedsOpen && (<>
              {needsReview.length === 0 && <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/50"><Eye className="h-4 w-4 mr-2 opacity-30" /> No PRs waiting for your review</div>}
              {needsReview.slice(0, shownNeeds).map(pr => <PRRow key={pr.id} pr={pr} pinned={false} onTogglePin={onTogglePin} />)}
              <LoadMore total={needsReview.length} shown={shownNeeds} onLoadMore={() => setShownNeeds(n => n + PAGE_SIZE)} />
            </>)}
            <GroupHeader label="Other pull requests" count={other.length} open={gOtherOpen} onToggle={() => setGOtherOpen(v => !v)} />
            {gOtherOpen && (<>
              {other.length === 0 && <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/50"><GitPullRequest className="h-4 w-4 mr-2 opacity-30" /> No pull requests</div>}
              {other.slice(0, shownOther).map(pr => <PRRow key={pr.id} pr={pr} pinned={false} onTogglePin={onTogglePin} />)}
              <LoadMore total={other.length} shown={shownOther} onLoadMore={() => setShownOther(n => n + PAGE_SIZE)} />
            </>)}
            {/* Followed */}
            <div className="flex items-center border-b border-border/50">
              <button onClick={() => setGFollowedOpen(v => !v)} className="flex flex-1 items-center gap-2 px-4 py-2 bg-muted/20 hover:bg-muted/30 transition-colors">
                {gFollowedOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400">Followed PRs</span>
                <span className="rounded-full px-1.5 py-px text-[9px] font-bold leading-none bg-sky-500/20 text-sky-400">{followedFiltered.length}</span>
              </button>
              <button onClick={() => setShowFollowDialog(true)} className="flex items-center gap-1 mx-2 h-6 px-2 rounded border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary text-[10px] transition-colors">
                <Plus className="h-3 w-3" /> Add by URL
              </button>
            </div>
            {gFollowedOpen && (<>
              {followedFiltered.length === 0 && <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground/50">
                <BookOpen className="h-5 w-5 opacity-30" />
                <p className="text-xs">No followed PRs yet.</p>
                <button onClick={() => setShowFollowDialog(true)} className="flex items-center gap-1 text-[10px] text-primary hover:underline"><Plus className="h-3 w-3" /> Add PR by URL</button>
              </div>}
              {followedFiltered.map(pr => (
                <div key={pr.id} className="relative group/followed">
                  <PRRow pr={pr} pinned={pinnedIds.has(pr.id)} onTogglePin={onTogglePin} />
                  <button onClick={e => { e.stopPropagation(); onRemoveFollowed(pr.id) }}
                    className="absolute right-10 top-1/2 -translate-y-1/2 opacity-0 group-hover/followed:opacity-100 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive transition-all"
                    title="Remove"><Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </>)}
          </>
        )}
      </div>
      {showFollowDialog && <FollowPRDialog onAdd={url => { const pr = parseFollowedPR(url); if (pr) onAddFollowed(pr) }} onClose={() => setShowFollowDialog(false)} />}
    </div>
  )
}

// ─── Issues Tab ───────────────────────────────────────────────────────────────

function IssuesTab({ allIssues, loading }: { allIssues: MockIssue[]; loading: boolean }) {
  const [search, setSearch] = useState(''); const [sortKey, setSortKey] = useState<SortKey>('date'); const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter()
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()
  const [shown, setShown] = useState(PAGE_SIZE)
  const repos = useMemo(() => [...new Set(allIssues.map(i => i.repo))].sort(), [allIssues])
  const statuses = useMemo(() => [...new Set(allIssues.map(i => i.status))].sort(), [allIssues])
  const authors = useMemo(() => [...new Set(allIssues.map(i => i.author))].sort(), [allIssues])
  function handleSort(k: SortKey) { if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('desc') } }
  const filtered = useMemo(() => allIssues.filter(issue => {
    if (statusFilter.size > 0 && !statusFilter.has(issue.status)) return false
    if (repoFilter.size > 0 && !repoFilter.has(issue.repo)) return false
    if (authorFilter.size > 0 && !authorFilter.has(issue.author)) return false
    if (search) { const q = search.toLowerCase(); return issue.title.toLowerCase().includes(q) || issue.author.toLowerCase().includes(q) || String(issue.number).includes(q) }
    return true
  }).sort((a, b) => { let cmp = 0; if (sortKey === 'date') cmp = a.updatedAt.getTime() - b.updatedAt.getTime(); else if (sortKey === 'author') cmp = a.author.localeCompare(b.author); else if (sortKey === 'repo') cmp = a.repo.localeCompare(b.repo); else if (sortKey === 'status') cmp = a.status.localeCompare(b.status); return sortDir === 'desc' ? -cmp : cmp }), [allIssues, search, statusFilter, repoFilter, authorFilter, sortKey, sortDir])
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Toolbar search={search} onSearch={setSearch} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} statusFilter={statusFilter} onToggleStatus={toggleStatus} onClearStatus={clearStatus} repoFilter={repoFilter} onToggleRepo={toggleRepo} onClearRepo={clearRepo} authorFilter={authorFilter} onToggleAuthor={toggleAuthor} onClearAuthor={clearAuthor} repos={repos} statuses={statuses} authors={authors} />
      <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/10 border-b border-border text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 shrink-0">
        <div className="w-4 shrink-0" /><div className="flex-1 min-w-0">Item</div><div className="shrink-0 w-[52px] text-right">Updated</div><div className="shrink-0 w-[70px] text-center">Status</div><div className="shrink-0 w-[90px]">Author</div><div className="shrink-0 w-[60px] text-center">Assigned</div><div className="shrink-0 w-[110px]">Repo</div><div className="shrink-0 w-6" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <IssueRowSkeleton />
            <IssueRowSkeleton />
            <IssueRowSkeleton />
            <IssueRowSkeleton />
          </>
        ) : filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground/50"><AlertCircle className="h-6 w-6 opacity-30" /><p className="text-xs">No issues match your filters</p></div>
          : <>{filtered.slice(0, shown).map(issue => <IssueRow key={issue.id} issue={issue} />)}<LoadMore total={filtered.length} shown={shown} onLoadMore={() => setShown(n => n + PAGE_SIZE)} /></>}
      </div>
    </div>
  )
}

// ─── Waiting for Review Tab ───────────────────────────────────────────────────

function WaitingForReviewTab({ allPRs, pinnedIds, onTogglePin, loading }: { allPRs: MockPR[]; pinnedIds: Set<string>; onTogglePin: (id: string) => void; loading: boolean }) {
  const [search, setSearch] = useState(''); const [sortKey, setSortKey] = useState<SortKey>('date'); const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [statusFilter, toggleStatus, clearStatus] = useSetFilter()
  const [repoFilter, toggleRepo, clearRepo] = useSetFilter()
  const [authorFilter, toggleAuthor, clearAuthor] = useSetFilter()
  const [shown, setShown] = useState(PAGE_SIZE)
  const repos = useMemo(() => [...new Set(allPRs.map(p => p.repo))].sort(), [allPRs])
  const statuses = useMemo(() => [...new Set(allPRs.map(p => p.status))].sort(), [allPRs])
  const authors = useMemo(() => [...new Set(allPRs.map(p => p.author))].sort(), [allPRs])
  function handleSort(k: SortKey) { if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('desc') } }
  const waitingPRs = useMemo(() => allPRs.filter(pr => pr.needsMyReview).filter(pr => {
    if (statusFilter.size > 0 && !statusFilter.has(pr.status)) return false
    if (repoFilter.size > 0 && !repoFilter.has(pr.repo)) return false
    if (authorFilter.size > 0 && !authorFilter.has(pr.author)) return false
    if (search) { const q = search.toLowerCase(); return pr.title.toLowerCase().includes(q) || pr.author.toLowerCase().includes(q) || pr.repo.toLowerCase().includes(q) }
    return true
  }).sort((a, b) => { let cmp = 0; if (sortKey === 'date') cmp = a.updatedAt.getTime() - b.updatedAt.getTime(); else if (sortKey === 'author') cmp = a.author.localeCompare(b.author); else if (sortKey === 'repo') cmp = a.repo.localeCompare(b.repo); return sortDir === 'desc' ? -cmp : cmp }), [allPRs, search, statusFilter, repoFilter, authorFilter, sortKey, sortDir])
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Toolbar search={search} onSearch={setSearch} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} statusFilter={statusFilter} onToggleStatus={toggleStatus} onClearStatus={clearStatus} repoFilter={repoFilter} onToggleRepo={toggleRepo} onClearRepo={clearRepo} authorFilter={authorFilter} onToggleAuthor={toggleAuthor} onClearAuthor={clearAuthor} repos={repos} statuses={statuses} authors={authors} />
      <TableHeader />
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <PRRowSkeleton />
            <PRRowSkeleton />
            <PRRowSkeleton />
            <PRRowSkeleton />
          </>
        ) : waitingPRs.length === 0 ? <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground/50"><CheckSquare className="h-6 w-6 opacity-30" /><p className="text-xs">You're all caught up</p></div>
          : <>{waitingPRs.slice(0, shown).map(pr => <PRRow key={pr.id} pr={pr} pinned={pinnedIds.has(pr.id)} onTogglePin={onTogglePin} />)}<LoadMore total={waitingPRs.length} shown={shown} onLoadMore={() => setShown(n => n + PAGE_SIZE)} /></>}
      </div>
    </div>
  )
}

// ─── Year Heatmap ─────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_LABELS = ['','Mon','','Wed','','Fri','']

function heatColor(count: number, max: number): string {
  if (count === 0) return 'bg-muted/40'
  const r = count / max
  if (r < 0.15) return 'bg-green-900/60'
  if (r < 0.35) return 'bg-green-700/70'
  if (r < 0.60) return 'bg-green-600/80'
  if (r < 0.80) return 'bg-green-500/90'
  return 'bg-green-400'
}

function YearHeatmap({ yearDays }: { yearDays: DayCommit[] }) {
  const max = Math.max(...yearDays.map(d => d.commits), 1)
  const firstDay = yearDays[0] ? new Date(yearDays[0].date + 'T00:00:00') : new Date()
  const startDow = (firstDay.getDay() + 6) % 7
  const padded: (DayCommit | null)[] = [...Array(startDow).fill(null), ...yearDays]
  const weeks: (DayCommit | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))
  const monthLabels: { week: number; label: string }[] = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const first = week.find(c => c !== null)
    if (!first) return
    const m = new Date(first.date + 'T00:00:00').getMonth()
    if (m !== lastMonth) { monthLabels.push({ week: wi, label: MONTHS[m] }); lastMonth = m }
  })

  // Portal-based tooltip — never clipped by parent overflow
  const { show: showTip, hide: hideTip, portal: tooltipPortal } = useImperativeTooltip()

  return (
    <div className="relative select-none">
      {/* Month labels row — uses same flex+gap layout as grid so columns stay aligned */}
      <div className="flex gap-0.5" style={{ paddingLeft: 28 }}>
        {weeks.map((_, wi) => {
          const lbl = monthLabels.find(m => m.week === wi)
          return (
            <div key={wi} style={{ width: 11, fontSize: 9, flexShrink: 0, color: 'var(--muted-foreground)' }}>
              {lbl ? lbl.label : ''}
            </div>
          )
        })}
      </div>

      <div className="flex">
        {/* Day-of-week labels */}
        <div className="flex flex-col gap-0.5 mr-1" style={{ width: 24 }}>
          {DAYS_LABELS.map((d, i) => <div key={i} style={{ height: 11, fontSize: 8, lineHeight: '11px', color: 'var(--muted-foreground)', textAlign: 'right', paddingRight: 2 }}>{d}</div>)}
        </div>

        {/* Grid cells */}
        <div className="flex gap-0.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {Array.from({ length: 7 }).map((_, di) => {
                const cell = week[di] ?? null
                if (!cell) return <div key={di} style={{ width: 11, height: 11 }} className="rounded-sm bg-transparent" />
                const fmtDate = new Date(cell.date + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
                const label = `${cell.commits} contribution${cell.commits !== 1 ? 's' : ''} on ${fmtDate}`
                return (
                  <div
                    key={di}
                    style={{ width: 11, height: 11 }}
                    className={`rounded-sm cursor-pointer transition-opacity hover:opacity-80 ${heatColor(cell.commits, max)}`}
                    onMouseEnter={e => showTip(label, e.currentTarget as HTMLElement)}
                    onMouseLeave={hideTip}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip portal (renders at document.body) */}
      {tooltipPortal}

      {/* Legend */}
      <div className="flex items-center gap-1 mt-2 justify-end">
        <span className="text-[9px] text-muted-foreground">Less</span>
        {['bg-muted/40','bg-green-900/60','bg-green-700/70','bg-green-600/80','bg-green-500/90','bg-green-400'].map((c, i) => <div key={i} style={{ width: 11, height: 11 }} className={`rounded-sm ${c}`} />)}
        <span className="text-[9px] text-muted-foreground">More</span>
      </div>
    </div>
  )
}

// ─── Commit Stats Tab ─────────────────────────────────────────────────────────

function CommitStatsTab({ commitDays, yearDays, loading }: { commitDays: DayCommit[]; yearDays: DayCommit[]; loading: boolean }) {
  const max14 = Math.max(...commitDays.map(d => d.commits), 1)
  const total14 = commitDays.reduce((s, d) => s + d.commits, 0)
  const avg14 = commitDays.length ? (total14 / commitDays.length).toFixed(1) : '0'
  const totalYear = yearDays.reduce((s, d) => s + d.commits, 0)
  const streak = (() => { let s = 0; for (let i = yearDays.length - 1; i >= 0; i--) { if (yearDays[i].commits > 0) s++; else break }; return s })()
  function fmtDate(ds: string): string { return new Date(ds + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }) }
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="grid grid-cols-4 gap-3">
          <KpiCard icon={<GitCommit className="h-3.5 w-3.5" />} label="Total commits" value={totalYear} sub="Last 365 days" loading={loading} />
          <KpiCard icon={<Activity className="h-3.5 w-3.5" />} label="Daily avg (14d)" value={avg14} sub="Commits / day" loading={loading} />
          <KpiCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Last 14 days" value={total14} sub="Push events" loading={loading} />
          <KpiCard icon={<Star className="h-3.5 w-3.5" />} label="Current streak" value={`${streak}d`} sub="Consecutive days" loading={loading} />
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Contribution activity</h3></div>
            {loading ? (
              <div className="w-32 h-3 bg-muted/40 animate-pulse rounded" />
            ) : (
              <span className="text-[10px] text-muted-foreground">{totalYear} contributions in the last year</span>
            )}
          </div>
          <div className="heatmap-container relative overflow-x-auto pb-1">
            {loading ? (
              <div className="w-full h-[100px] bg-muted/20 animate-pulse rounded-lg flex items-center justify-center text-[10px] text-muted-foreground/40">Loading contribution map...</div>
            ) : (
              <YearHeatmap yearDays={yearDays} />
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><BarChart2 className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Last 14 days — daily activity</h3></div></div>
          {loading ? (
            <div className="w-full h-24 bg-muted/20 animate-pulse rounded-lg" />
          ) : (
            <>
              <div className="flex items-end gap-1" style={{ height: 100 }}>
                {commitDays.map((day, i) => { const pct = max14 > 0 ? (day.commits / max14) * 100 : 0; return (
                  <div key={i} className="flex flex-col items-center gap-1 flex-1 group/bar">
                    <div className="relative w-full flex items-end justify-center" style={{ height: 80 }}>
                      {day.commits > 0 ? <div className="w-full rounded-t bg-primary/70 group-hover/bar:bg-primary transition-all duration-200 relative" style={{ height: `${Math.max(pct, 4)}%` }}><div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover/bar:block text-[9px] bg-popover border border-border rounded px-1 py-px text-foreground whitespace-nowrap shadow">{day.commits}</div></div> : <div className="w-full rounded-t bg-muted/30" style={{ height: '4%' }} />}
                    </div>
                    <span className="text-[8px] text-muted-foreground/50">{fmtDate(day.date).split(' ')[1]}</span>
                  </div>
                )})}
              </div>
              <div className="flex justify-between mt-1">
                {commitDays.length > 0 && <><span className="text-[8px] text-muted-foreground/40">{fmtDate(commitDays[0].date)}</span><span className="text-[8px] text-muted-foreground/40">{fmtDate(commitDays[commitDays.length - 1].date)}</span></>}
              </div>
            </>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/10"><GitCommit className="h-3.5 w-3.5 text-primary/60" /><h3 className="text-xs font-semibold">Daily breakdown — last 14 days</h3></div>
          {loading ? (
            <div className="p-4 space-y-3">
              <div className="h-3 bg-muted/40 animate-pulse rounded w-full" />
              <div className="h-3 bg-muted/40 animate-pulse rounded w-5/6" />
              <div className="h-3 bg-muted/40 animate-pulse rounded w-4/5" />
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {[...commitDays].reverse().map((day, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-2.5 hover:bg-accent/20 transition-colors">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{fmtDate(day.date)}</span>
                  <div className="flex-1 bg-muted/20 rounded-full h-1.5 overflow-hidden"><div className="bg-primary/70 h-full rounded-full transition-all duration-500" style={{ width: max14 > 0 ? `${(day.commits / max14) * 100}%` : '0%' }} /></div>
                  <span className="text-xs font-mono text-foreground w-8 text-right shrink-0">{day.commits}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Filter Editor Dialog ─────────────────────────────────────────────────────

const ALL_STATUSES: FilterStatus[] = ['open', 'draft', 'approved', 'changes_requested', 'merged', 'closed']
const EMOJI_OPTIONS = ['👀','🐛','✨','🚀','🔥','🔒','⚡','📦','🎯','🛠','📋','🧪','💡','🔍','⭐']

type FilterDraft = Omit<SavedFilter, 'id' | 'createdAt'>

function FilterEditorDialog({ initial, onSave, onClose }: {
  initial?: FilterDraft; onSave: (f: FilterDraft) => void; onClose: () => void
}) {
  const [form, setForm] = useState<FilterDraft>(initial ?? { name: '', emoji: '🔍', type: 'both', titleContains: '', authorContains: '', repo: '', labelContains: '', statuses: [], needsMyReview: undefined })

  function set<K extends keyof FilterDraft>(key: K, val: FilterDraft[K]) { setForm(f => ({ ...f, [key]: val })) }
  function toggleStatus(s: FilterStatus) {
    const cur = form.statuses ?? []
    set('statuses', cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s])
  }

  const isValid = form.name.trim().length > 0
  function handleSave() { if (isValid) { onSave({ ...form, name: form.name.trim() }); onClose() } }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2"><Sliders className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">{initial ? 'Edit filter' : 'New custom filter'}</h2></div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name + emoji */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Filter name</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. My bugfixes"
                className="w-full h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Emoji</label>
              <div className="relative">
                <select value={form.emoji} onChange={e => set('emoji', e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none pr-6"
                  style={{ minWidth: 60 }}
                >
                  {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Applies to</label>
            <div className="flex gap-2">
              {([['prs','Pull Requests'],['issues','Issues'],['both','Both']] as [FilterType, string][]).map(([v, lbl]) => (
                <button key={v} onClick={() => set('type', v)}
                  className={`flex-1 h-8 rounded-md border text-xs transition-colors ${form.type === v ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'}`}
                >{lbl}</button>
              ))}
            </div>
          </div>

          <div className="border-t border-border/40 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Filter criteria <span className="normal-case font-normal">(all active criteria are combined with AND)</span></p>
            <div className="space-y-3">
              {/* Title contains */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground w-32 shrink-0">Title contains</label>
                <input type="text" value={form.titleContains ?? ''} onChange={e => set('titleContains', e.target.value)}
                  placeholder="e.g. bug, feat, hotfix…"
                  className="flex-1 h-7 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              {/* Author contains */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground w-32 shrink-0">Author contains</label>
                <input type="text" value={form.authorContains ?? ''} onChange={e => set('authorContains', e.target.value)}
                  placeholder="e.g. antoine"
                  className="flex-1 h-7 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              {/* Repo */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground w-32 shrink-0">Repository</label>
                <input type="text" value={form.repo ?? ''} onChange={e => set('repo', e.target.value)}
                  placeholder="e.g. git-manager (exact)"
                  className="flex-1 h-7 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              {/* Label contains */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground w-32 shrink-0">Label contains</label>
                <input type="text" value={form.labelContains ?? ''} onChange={e => set('labelContains', e.target.value)}
                  placeholder="e.g. bug, enhancement…"
                  className="flex-1 h-7 rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>

              {/* Status — PRs only */}
              {(form.type === 'prs' || form.type === 'both') && (
                <div className="flex items-start gap-3">
                  <label className="text-xs text-muted-foreground w-32 shrink-0 pt-1">PR status</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_STATUSES.map(s => {
                      const active = (form.statuses ?? []).includes(s)
                      const cfg = STATUS_CONFIG[s]
                      return (
                        <button key={s} onClick={() => toggleStatus(s)}
                          className={`flex items-center rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition-colors ${active ? cfg.className + ' ring-1 ring-offset-0 ring-current' : 'border-border text-muted-foreground hover:text-foreground'}`}
                        >
                          {active && <CheckCircle2 className="h-2.5 w-2.5 mr-1" />}
                          {cfg.label}
                        </button>
                      )
                    })}
                    {(form.statuses ?? []).length > 0 && <button onClick={() => set('statuses', [])} className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground underline">Clear</button>}
                  </div>
                </div>
              )}

              {/* Needs my review — PRs only */}
              {(form.type === 'prs' || form.type === 'both') && (
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground w-32 shrink-0">Needs my review</label>
                  <div className="flex gap-2">
                    {([['yes', true], ['no', false], ['any', undefined]] as [string, boolean | undefined][]).map(([lbl, val]) => (
                      <button key={lbl} onClick={() => set('needsMyReview', val)}
                        className={`h-6 px-3 rounded border text-[10px] transition-colors capitalize ${form.needsMyReview === val ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      >{lbl}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/5">
          <button onClick={onClose} className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!isValid}
            className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center gap-1.5"
          >
            <Save className="h-3 w-3" /> {initial ? 'Save changes' : 'Create filter'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Single Custom View ───────────────────────────────────────────────────────

function CustomViewResults({ filter, allPRs, allIssues, pinnedIds, onTogglePin, loading }: {
  filter: SavedFilter; allPRs: MockPR[]; allIssues: MockIssue[]
  pinnedIds: Set<string>; onTogglePin: (id: string) => void
  loading: boolean
}) {
  const [shownPRs, setShownPRs] = useState(PAGE_SIZE)
  const [shownIssues, setShownIssues] = useState(PAGE_SIZE)
  const [search, setSearch] = useState('')

  const matchedPRs = useMemo(() => {
    if (filter.type === 'issues') return []
    return allPRs.filter(pr => {
      if (search && !pr.title.toLowerCase().includes(search.toLowerCase())) return false
      return matchesPR(pr, filter)
    })
  }, [allPRs, filter, search])

  const matchedIssues = useMemo(() => {
    if (filter.type === 'prs') return []
    return allIssues.filter(issue => {
      if (search && !issue.title.toLowerCase().includes(search.toLowerCase())) return false
      return matchesIssue(issue, filter)
    })
  }, [allIssues, filter, search])

  const total = matchedPRs.length + matchedIssues.length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/5 shrink-0">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search within this view…"
            className="w-full pl-7 pr-6 h-7 rounded-md border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
        </div>
        <span className="text-[10px] text-muted-foreground">{total} result{total !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            {filter.type !== 'issues' && (
              <>
                {filter.type === 'both' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/15 border-b border-border/50 shrink-0">
                    <GitPullRequest className="h-3 w-3 text-green-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pull Requests</span>
                  </div>
                )}
                <TableHeader />
                <PRRowSkeleton />
                <PRRowSkeleton />
              </>
            )}
            {filter.type !== 'prs' && (
              <>
                {filter.type === 'both' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/15 border-b border-border/50 shrink-0 mt-4">
                    <AlertCircle className="h-3 w-3 text-blue-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Issues</span>
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/10 border-b border-border text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 shrink-0">
                  <div className="w-4 shrink-0" /><div className="flex-1 min-w-0">Item</div><div className="shrink-0 w-[52px] text-right">Updated</div><div className="shrink-0 w-[70px] text-center">Status</div><div className="shrink-0 w-[90px]">Author</div><div className="shrink-0 w-[60px] text-center">Assigned</div><div className="shrink-0 w-[110px]">Repo</div><div className="shrink-0 w-6" />
                </div>
                <IssueRowSkeleton />
                <IssueRowSkeleton />
              </>
            )}
          </>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground/50">
            <span className="text-3xl">{filter.emoji}</span>
            <p className="text-xs">No results match this filter</p>
          </div>
        ) : (
          <>
            {matchedPRs.length > 0 && (
              <>
                {filter.type === 'both' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/15 border-b border-border/50 shrink-0">
                    <GitPullRequest className="h-3 w-3 text-green-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pull Requests</span>
                    <span className="rounded-full px-1.5 py-px text-[9px] font-bold leading-none bg-muted text-muted-foreground">{matchedPRs.length}</span>
                  </div>
                )}
                <TableHeader />
                {matchedPRs.slice(0, shownPRs).map(pr => <PRRow key={pr.id} pr={pr} pinned={pinnedIds.has(pr.id)} onTogglePin={onTogglePin} />)}
                <LoadMore total={matchedPRs.length} shown={shownPRs} onLoadMore={() => setShownPRs(n => n + PAGE_SIZE)} />
              </>
            )}

            {matchedIssues.length > 0 && (
              <>
                {filter.type === 'both' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/15 border-b border-border/50 shrink-0">
                    <AlertCircle className="h-3 w-3 text-blue-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Issues</span>
                    <span className="rounded-full px-1.5 py-px text-[9px] font-bold leading-none bg-muted text-muted-foreground">{matchedIssues.length}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/10 border-b border-border text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 shrink-0">
                  <div className="w-4 shrink-0" /><div className="flex-1 min-w-0">Item</div><div className="shrink-0 w-[52px] text-right">Updated</div><div className="shrink-0 w-[70px] text-center">Status</div><div className="shrink-0 w-[90px]">Author</div><div className="shrink-0 w-[60px] text-center">Assigned</div><div className="shrink-0 w-[110px]">Repo</div><div className="shrink-0 w-6" />
                </div>
                {matchedIssues.slice(0, shownIssues).map(issue => <IssueRow key={issue.id} issue={issue} />)}
                <LoadMore total={matchedIssues.length} shown={shownIssues} onLoadMore={() => setShownIssues(n => n + PAGE_SIZE)} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Custom Views Tab ─────────────────────────────────────────────────────────

function CustomViewsTab({ allPRs, allIssues, pinnedIds, onTogglePin, loading }: {
  allPRs: MockPR[]; allIssues: MockIssue[]; pinnedIds: Set<string>; onTogglePin: (id: string) => void
  loading: boolean
}) {
  const { savedFilters, addFilter, updateFilter, deleteFilter } = useLaunchpadStore()
  const [activeFilterId, setActiveFilterId] = useState<string | null>(savedFilters[0]?.id ?? null)
  const [showEditor, setShowEditor] = useState(false)
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const activeFilter = savedFilters.find(f => f.id === activeFilterId) ?? null

  function handleCreate(draft: Omit<SavedFilter, 'id' | 'createdAt'>) { addFilter(draft) }
  function handleUpdate(id: string, draft: Omit<SavedFilter, 'id' | 'createdAt'>) { updateFilter(id, draft) }
  function handleDelete(id: string) {
    deleteFilter(id)
    if (activeFilterId === id) setActiveFilterId(savedFilters.filter(f => f.id !== id)[0]?.id ?? null)
    setConfirmDeleteId(null)
  }

  // Count matching items per filter
  function countForFilter(f: SavedFilter): number {
    const prCount = f.type === 'issues' ? 0 : allPRs.filter(pr => matchesPR(pr, f)).length
    const issueCount = f.type === 'prs' ? 0 : allIssues.filter(issue => matchesIssue(issue, f)).length
    return prCount + issueCount
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — filter list */}
      <div className="w-52 shrink-0 flex flex-col border-r border-border bg-muted/5">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saved filters</span>
          <button onClick={() => { setEditingFilter(null); setShowEditor(true) }}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
            title="New filter"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {savedFilters.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground/50 px-3">
              <Layers className="h-5 w-5 opacity-30" />
              <p className="text-[10px] text-center">No filters yet.<br />Click + to create one.</p>
            </div>
          )}
          {savedFilters.map(f => {
            const count = countForFilter(f)
            const isActive = f.id === activeFilterId
            return (
              <div key={f.id} className={`group/filter relative flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'}`}
                onClick={() => setActiveFilterId(f.id)}
              >
                <span className="text-sm shrink-0">{f.emoji}</span>
                <span className="text-xs font-medium truncate flex-1">{f.name}</span>
                <span className={`rounded-full px-1.5 py-px text-[9px] font-bold leading-none shrink-0 ${isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>{count}</span>
                <div className="absolute right-1 hidden group-hover/filter:flex items-center gap-0.5">
                  <button onClick={e => { e.stopPropagation(); setEditingFilter(f); setShowEditor(true) }}
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                  {confirmDeleteId === f.id ? (
                    <button onClick={e => { e.stopPropagation(); handleDelete(f.id) }}
                      className="h-5 px-1 flex items-center justify-center rounded bg-destructive/10 text-destructive text-[9px] font-medium"
                    >
                      Confirm
                    </button>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(f.id) }}
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Filter description */}
        {activeFilter && (
          <div className="border-t border-border px-3 py-3 space-y-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">Criteria</p>
            {activeFilter.titleContains && <p className="text-[10px] text-muted-foreground"><span className="font-medium text-foreground/70">Title:</span> "{activeFilter.titleContains}"</p>}
            {activeFilter.authorContains && <p className="text-[10px] text-muted-foreground"><span className="font-medium text-foreground/70">Author:</span> {activeFilter.authorContains}</p>}
            {activeFilter.repo && <p className="text-[10px] text-muted-foreground"><span className="font-medium text-foreground/70">Repo:</span> {activeFilter.repo}</p>}
            {activeFilter.labelContains && <p className="text-[10px] text-muted-foreground"><span className="font-medium text-foreground/70">Label:</span> {activeFilter.labelContains}</p>}
            {(activeFilter.statuses?.length ?? 0) > 0 && <p className="text-[10px] text-muted-foreground"><span className="font-medium text-foreground/70">Status:</span> {activeFilter.statuses?.join(', ')}</p>}
            {activeFilter.needsMyReview === true && <p className="text-[10px] text-muted-foreground">Needs my review</p>}
            {!activeFilter.titleContains && !activeFilter.authorContains && !activeFilter.repo && !activeFilter.labelContains && !activeFilter.statuses?.length && activeFilter.needsMyReview === undefined && (
              <p className="text-[10px] text-muted-foreground/40 italic">No criteria (matches all)</p>
            )}
          </div>
        )}
      </div>

      {/* Right content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {activeFilter ? (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card/30 shrink-0">
              <span className="text-base">{activeFilter.emoji}</span>
              <span className="text-sm font-semibold text-foreground">{activeFilter.name}</span>
              <span className="text-[10px] text-muted-foreground/60 capitalize">— {activeFilter.type === 'both' ? 'PRs & Issues' : activeFilter.type === 'prs' ? 'Pull Requests' : 'Issues'}</span>
            </div>
            <CustomViewResults filter={activeFilter} allPRs={allPRs} allIssues={allIssues} pinnedIds={pinnedIds} onTogglePin={onTogglePin} loading={loading} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-muted-foreground/50">
            <Layers className="h-8 w-8 opacity-20" />
            <div className="text-center">
              <p className="text-sm font-medium">No filter selected</p>
              <p className="text-xs mt-1">Create a filter to get started</p>
            </div>
            <button onClick={() => { setEditingFilter(null); setShowEditor(true) }}
              className="flex items-center gap-2 h-8 px-4 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> New filter
            </button>
          </div>
        )}
      </div>

      {showEditor && (
        <FilterEditorDialog
          initial={editingFilter ? { name: editingFilter.name, emoji: editingFilter.emoji, type: editingFilter.type, titleContains: editingFilter.titleContains, authorContains: editingFilter.authorContains, repo: editingFilter.repo, labelContains: editingFilter.labelContains, statuses: editingFilter.statuses, needsMyReview: editingFilter.needsMyReview } : undefined}
          onSave={draft => {
            if (editingFilter) handleUpdate(editingFilter.id, draft)
            else handleCreate(draft)
          }}
          onClose={() => { setShowEditor(false); setEditingFilter(null) }}
        />
      )}
    </div>
  )
}

// ─── Main Launchpad Page ──────────────────────────────────────────────────────

export function PullRequestsPage() {
  const [activeTab, setActiveTab] = useState<InnerTab>('prs')
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())
  const [followedPRs, setFollowedPRs] = useState<MockPR[]>([])

  const { prs, issues, commitDays, yearDays, loading, error, hasToken, username, lastRefreshed, refresh } = useGitHubData()
  const { savedFilters } = useLaunchpadStore()

  const togglePin = useCallback((id: string) => {
    setPinnedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }, [])
  const addFollowed = useCallback((pr: MockPR) => setFollowedPRs(prev => prev.some(p => p.id === pr.id) ? prev : [...prev, pr]), [])
  const removeFollowed = useCallback((id: string) => setFollowedPRs(prev => prev.filter(p => p.id !== id)), [])

  const openPRsCount = prs.filter(p => p.status === 'open' || p.status === 'draft').length
  const needsReviewCount = prs.filter(p => p.needsMyReview).length
  const openIssuesCount = issues.filter(i => i.status === 'open').length
  const ciPassRate = prs.length > 0 ? Math.round((prs.filter(p => p.ciStatus === 'success').length / prs.length) * 100) : 0
  const weekCommits = commitDays.slice(-7).reduce((s, d) => s + d.commits, 0)



  const tabCounts: Record<InnerTab, number | undefined> = {
    prs: prs.filter(p => p.status !== 'closed' && p.status !== 'merged').length + followedPRs.length,
    issues: issues.filter(i => i.status === 'open').length,
    waiting: needsReviewCount,
    stats: undefined,
    views: savedFilters.length,
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Page Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card/50 px-5 py-2.5 shrink-0 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-bold text-foreground tracking-wide">Launchpad</h1>
        </div>
        <div className="h-4 w-px bg-border" />
        {hasToken ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {loading ? <><Loader2 className="h-3 w-3 animate-spin" /> Fetching…</>
              : error ? <><WifiOff className="h-3 w-3 text-destructive" /> <span className="text-destructive">{error}</span></>
              : <><CheckCircle2 className="h-3 w-3 text-green-400" /> Synced as <strong className="text-foreground ml-0.5">{username}</strong></>}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
            <WifiOff className="h-3 w-3" /> No GitHub account — showing demo data
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {lastRefreshed && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
              <Clock className="h-3 w-3" /> {timeAgo(lastRefreshed)}
            </span>
          )}
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/40 transition-colors disabled:opacity-40"
            title="Refresh now"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      {/* Overview KPI Bar */}
      <div className="flex items-stretch gap-3 px-5 py-3 border-b border-border bg-card/20 shrink-0">
        <KpiCard icon={<GitPullRequest className="h-3.5 w-3.5 text-green-400" />} label="Open PRs" value={openPRsCount} sub="Across all repos" loading={loading} />
        <KpiCard icon={<Eye className="h-3.5 w-3.5 text-orange-400" />} label="Needs review" value={needsReviewCount} sub="Waiting for you" accent="hover:border-orange-500/20" loading={loading} />
        <KpiCard icon={<AlertCircle className="h-3.5 w-3.5 text-blue-400" />} label="Open issues" value={openIssuesCount} sub="Assigned or watching" loading={loading} />
        <KpiCard icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />} label="CI pass rate" value={`${ciPassRate}%`} sub="Last 30 days" loading={loading} />
        <KpiCard icon={<GitCommit className="h-3.5 w-3.5 text-purple-400" />} label="Commits" value={weekCommits} sub="This week" loading={loading} />
      </div>
 
      {/* Inner Tab Bar */}
      <div className="flex items-center border-b border-border bg-card/30 shrink-0 px-3">
        <InnerTab active={activeTab === 'prs'} onClick={() => setActiveTab('prs')} count={tabCounts.prs} loading={loading}><GitPullRequest className="h-3.5 w-3.5" /> My Pull Requests</InnerTab>
        <InnerTab active={activeTab === 'issues'} onClick={() => setActiveTab('issues')} count={tabCounts.issues} loading={loading}><AlertCircle className="h-3.5 w-3.5" /> My Issues</InnerTab>
        <InnerTab active={activeTab === 'waiting'} onClick={() => setActiveTab('waiting')} count={tabCounts.waiting} loading={loading}><Eye className="h-3.5 w-3.5" /> Waiting for Review</InnerTab>
        <InnerTab active={activeTab === 'stats'} onClick={() => setActiveTab('stats')}><BarChart2 className="h-3.5 w-3.5" /> Commit Stats</InnerTab>
        <InnerTab active={activeTab === 'views'} onClick={() => setActiveTab('views')} count={tabCounts.views} loading={loading}><Sliders className="h-3.5 w-3.5" /> Custom Views</InnerTab>
      </div>
 
      {/* Tab Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'prs' && <PullRequestsTab allPRs={prs} followedPRs={followedPRs} pinnedIds={pinnedIds} onTogglePin={togglePin} onAddFollowed={addFollowed} onRemoveFollowed={removeFollowed} loading={loading} />}
        {activeTab === 'issues' && <IssuesTab allIssues={issues} loading={loading} />}
        {activeTab === 'waiting' && <WaitingForReviewTab allPRs={prs} pinnedIds={pinnedIds} onTogglePin={togglePin} loading={loading} />}
        {activeTab === 'stats' && <CommitStatsTab commitDays={commitDays} yearDays={yearDays} loading={loading} />}
        {activeTab === 'views' && <CustomViewsTab allPRs={prs} allIssues={issues} pinnedIds={pinnedIds} onTogglePin={togglePin} loading={loading} />}
      </div>
    </div>
  )
}
