import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Fixed port for the suite-wide fake GitHub server, started once in `wdio.conf.ts`'s `onPrepare` —
 * same reasoning as `fakeAiServer.ts`'s `SUITE_WIDE_FAKE_AI_PORT`, but load-bearing here in a way it
 * isn't for the AI server: the app's GitHub API base URL is a Rust-side env var read once per
 * request (`GIT_MANAGER_GITHUB_API_BASE_URL`, see `services/github_api.rs`'s `e2e_redirect`), not a
 * runtime-mutable setting, so it has to be known *before* the app process is spawned in `onPrepare`
 * — a worker process (where step definitions run) cannot start its own per-scenario server on an
 * ephemeral port and repoint the already-running app at it the way `ai-generation.steps.ts` does for
 * the AI provider URL. One server serves every scenario in the run.
 *
 * Because `onPrepare` and the worker processes that run step definitions are separate OS processes
 * (see `fakeAiServer.ts`'s own note on this), a step definition cannot mutate this server's in-memory
 * state directly — it isn't the same module instance. {@link configureFakeGithubFixtures} and
 * {@link resetFakeGithubFixtures} therefore reach it over the loopback HTTP connection every other
 * caller uses too, via two endpoints (`/__configure`, `/__reset`) that live outside GitHub's own URL
 * space (every real GitHub path starts with `/repos`, `/search`, `/graphql`, or `/user`).
 */
export const SUITE_WIDE_FAKE_GITHUB_PORT = 8935
export const SUITE_WIDE_FAKE_GITHUB_URL = `http://127.0.0.1:${SUITE_WIDE_FAKE_GITHUB_PORT}`

export interface FakeGithubServerHandle {
  url: string
  stop: () => Promise<void>
}

/** Minimal shape covering every field the frontend's `GhRawPR` reads (see `github-pulls.api.ts`). */
export interface FakePr {
  number: number
  /** GraphQL global node id — required by the draft-toggle mutations, which carry no owner/repo. */
  node_id?: string
  title: string
  body?: string | null
  html_url: string
  state: 'open' | 'closed'
  draft?: boolean
  merged_at?: string | null
  user?: { login: string; avatar_url: string }
  requested_reviewers?: { login: string; avatar_url: string }[]
  assignees?: { login: string; avatar_url: string }[]
  labels?: { name: string; color?: string; description?: string | null }[]
  changed_files?: number
  additions?: number
  deletions?: number
  created_at?: string
  updated_at?: string
  comments?: number
  base?: { ref?: string; sha?: string }
  head?: { ref?: string; sha?: string }
  mergeable?: boolean | null
  mergeable_state?: string
}

export interface FakeIssue {
  number: number
  title: string
  body?: string | null
  html_url: string
  state: 'open' | 'closed'
  user?: { login: string; avatar_url: string }
  labels?: { name: string; color?: string }[]
  created_at?: string
  updated_at?: string
  comments?: number
}

export interface FakeComment {
  id: number
  body: string
  html_url: string
  created_at: string
  updated_at: string
  user?: { login: string; avatar_url: string }
}

export interface FakePrFile {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

export interface FakeMergeability {
  mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  mergeStateStatus?: string
  reviewDecision?: string | null
  viewerCanMergeAsAdmin?: boolean
}

export interface FakeReviewThread {
  id: string
  isResolved: boolean
  isOutdated: boolean
  path: string
  line: number | null
  author: string
  bodyText: string
  url: string
}

/** One repo's worth of fixtures, keyed by `owner/repo` in {@link FakeGithubFixtures}. */
export interface FakeRepoFixtures {
  /** Open pull requests — backs both the list (`GET .../pulls?state=open`) and, matched by number,
   * the single-PR detail endpoint. */
  openPulls?: FakePr[]
  closedPulls?: FakePr[]
  /** Open issues (the "add issue to board" picker + the remote board's own card list) — mutated in
   * place when the real `POST .../issues/:number/labels` call arrives, so a board's re-fetch after
   * labeling an issue sees the label without a test needing to seed it twice. */
  openIssues?: FakeIssue[]
  /** Per-PR-number extras, since these are keyed deeper than the repo alone. */
  comments?: Record<number, FakeComment[]>
  files?: Record<number, FakePrFile[]>
  mergeability?: Record<number, FakeMergeability>
  reviewThreads?: Record<number, FakeReviewThread[]>
  filesViewedState?: Record<
    number,
    { pullRequestId: string; viewedByPath?: Record<string, string> }
  >
  /** Candidate pool for the reviewer/assignee edit popover (`GET .../assignees`). */
  assignableUsers?: { login: string; avatar_url: string }[]
  /** Candidate pool for the label edit popover (`GET .../labels`). */
  repoLabels?: { name: string; color?: string; description?: string | null }[]
}

export interface FakeGithubFixtures {
  /** Keyed `"owner/repo"`. */
  repos: Record<string, FakeRepoFixtures>
}

function emptyFixtures(): FakeGithubFixtures {
  return { repos: {} }
}

let fixtures: FakeGithubFixtures = emptyFixtures()

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    req.on('end', () => resolve(body))
  })
}

/** Matches `/repos/:owner/:repo/<rest>`, splitting `<rest>` into its own segments. */
function matchRepoPath(pathname: string): { owner: string; repo: string; rest: string[] } | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'repos' || parts.length < 3) return null
  return { owner: parts[1], repo: parts[2], rest: parts.slice(3) }
}

/** A real GitHub REST call throws on a non-2xx status (`ghRequest`); 404 is what "not configured"
 * should read as, not an empty 200 — an empty list and "this doesn't exist" are different answers a
 * test might need to tell apart. */
function notFound(res: http.ServerResponse): void {
  sendJson(res, 404, { message: 'Not Found (fake GitHub server: no fixture configured)' })
}

/** Finds the fixture entity a given issue/PR number refers to — a PR and an issue share the same
 * number space on GitHub, and several write endpoints (labels, assignees) apply to either shape.
 * Checked in this order since a PR is also technically an issue but not vice versa. */
function findEntityByNumber(
  repoFixtures: FakeRepoFixtures | undefined,
  number: number
): FakePr | FakeIssue | undefined {
  return (
    repoFixtures?.openPulls?.find((p) => p.number === number) ??
    repoFixtures?.closedPulls?.find((p) => p.number === number) ??
    repoFixtures?.openIssues?.find((i) => i.number === number)
  )
}

/** Same lookup, scoped to pull requests only — for PR-only fields (`requested_reviewers`, `draft`,
 * `merged_at`) that a plain `FakeIssue` doesn't carry. */
function findPrByNumber(
  repoFixtures: FakeRepoFixtures | undefined,
  number: number
): FakePr | undefined {
  return (
    repoFixtures?.openPulls?.find((p) => p.number === number) ??
    repoFixtures?.closedPulls?.find((p) => p.number === number)
  )
}

function handleGraphQL(body: string, res: http.ServerResponse): void {
  let parsed: {
    query?: string
    variables?: { owner?: string; repo?: string; number?: number; id?: string }
  }
  try {
    parsed = JSON.parse(body)
  } catch {
    sendJson(res, 400, { message: 'invalid JSON' })
    return
  }
  const { query = '', variables = {} } = parsed
  const { owner, repo, number, id: nodeId } = variables
  const repoFixtures = owner && repo ? fixtures.repos[`${owner}/${repo}`] : undefined

  // The draft-toggle mutations carry no owner/repo — only the PR's global node id — so this has to
  // search every repo's pull requests rather than scoping to `repoFixtures` like the queries below.
  if (
    query.includes('convertPullRequestToDraft') ||
    query.includes('markPullRequestReadyForReview')
  ) {
    const draft = query.includes('convertPullRequestToDraft')
    let pr: FakePr | undefined
    for (const repoFx of Object.values(fixtures.repos)) {
      pr =
        repoFx.openPulls?.find((p) => p.node_id === nodeId) ??
        repoFx.closedPulls?.find((p) => p.node_id === nodeId)
      if (pr) break
    }
    if (pr) pr.draft = draft
    const mutationName = draft ? 'convertPullRequestToDraft' : 'markPullRequestReadyForReview'
    sendJson(res, 200, {
      data: { [mutationName]: { pullRequest: { isDraft: pr?.draft ?? draft } } },
    })
    return
  }

  // Distinguishing substrings unique to each query this suite issues — same technique
  // `fakeAiServer.ts` uses to tell completion features apart by JSON schema name.
  if (query.includes('mergeStateStatus')) {
    const m = repoFixtures?.mergeability?.[number ?? -1] ?? {}
    sendJson(res, 200, {
      data: {
        repository: {
          pullRequest: {
            mergeable: m.mergeable ?? 'UNKNOWN',
            mergeStateStatus: m.mergeStateStatus ?? 'UNKNOWN',
            reviewDecision: m.reviewDecision ?? null,
            viewerCanMergeAsAdmin: m.viewerCanMergeAsAdmin ?? false,
            commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [] } } } }] },
          },
        },
      },
    })
    return
  }

  if (query.includes('reviewThreads')) {
    const threads = repoFixtures?.reviewThreads?.[number ?? -1] ?? []
    sendJson(res, 200, {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: threads.map((t) => ({
                id: t.id,
                isResolved: t.isResolved,
                isOutdated: t.isOutdated,
                path: t.path,
                line: t.line,
                comments: {
                  nodes: [{ author: { login: t.author }, bodyText: t.bodyText, url: t.url }],
                },
              })),
            },
          },
        },
      },
    })
    return
  }

  if (query.includes('viewerViewedState')) {
    const state = repoFixtures?.filesViewedState?.[number ?? -1]
    sendJson(res, 200, {
      data: {
        repository: {
          pullRequest: {
            id: state?.pullRequestId ?? `fake-pr-node-${owner}-${repo}-${number}`,
            files: {
              nodes: Object.entries(state?.viewedByPath ?? {}).map(([path, viewerViewedState]) => ({
                path,
                viewerViewedState,
              })),
            },
          },
        },
      },
    })
    return
  }

  sendJson(res, 200, { data: {} })
}

/**
 * A minimal GitHub REST + GraphQL server for driving the real `github_api_request` Rust command end
 * to end, redirected here by `services/github_api.rs`'s e2e-only origin rewrite — see
 * `docs/architecture/2026-08-e2e-github-api-mock-mode.md` for why this exists as a real local HTTP
 * server rather than a mock injected at the IPC layer.
 *
 * Covers exactly the endpoints the currently-unblocked scenarios need (the PR detail view and its
 * write actions, and adding an existing issue to a GitHub-backed board) — not a general GitHub API
 * simulator. Extend {@link FakeRepoFixtures}/the request handler here when a new scenario needs
 * another endpoint, the same way `fakeAiServer.ts` grew one branch per AI feature.
 */
export async function startFakeGithubServer(
  options: { port?: number } = {}
): Promise<FakeGithubServerHandle> {
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const pathname = url.pathname

      if (req.method === 'POST' && pathname === '/__configure') {
        const body = await readBody(req)
        const incoming = JSON.parse(body) as FakeGithubFixtures
        for (const [key, repo] of Object.entries(incoming.repos ?? {})) {
          fixtures.repos[key] = { ...fixtures.repos[key], ...repo }
        }
        sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && pathname === '/__reset') {
        fixtures = emptyFixtures()
        sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && pathname === '/graphql') {
        const body = await readBody(req)
        handleGraphQL(body, res)
        return
      }

      // GET /search/issues?q=... — backs the Launchpad's cross-repo issue list
      // (`fetchGitHubRepoIssues`, one `repo:owner/repo` qualifier per saved project the search
      // is:issue+repo:a/b+repo:c/d — decoded to space-separated by URLSearchParams) and, for
      // `is:pr`, its PR-list equivalent. Every matching repo's fixtures are pooled, not just the
      // first qualifier, so a scenario that saves more than one project gets results from all of
      // them, matching the real "every repo you've added" behavior. `items` need a
      // `repository_url` because `rawToMockIssue`/`rawToMockPR` derive `fullName` from it for a
      // search result, unlike the single-repo REST endpoints below.
      if (req.method === 'GET' && pathname === '/search/issues') {
        const q = url.searchParams.get('q') ?? ''
        const repoQualifiers = [...q.matchAll(/repo:(\S+)/g)].map((m) => m[1])
        const isPr = /\bis:pr\b/.test(q)
        const items = repoQualifiers.flatMap((repoKey) => {
          const repoFixturesForSearch = fixtures.repos[repoKey]
          const pool = isPr
            ? (repoFixturesForSearch?.openPulls ?? [])
            : (repoFixturesForSearch?.openIssues ?? [])
          return pool.map((item) => ({
            ...item,
            repository_url: `https://api.github.com/repos/${repoKey}`,
          }))
        })
        sendJson(res, 200, { items })
        return
      }

      const repoMatch = matchRepoPath(pathname)
      if (!repoMatch) {
        notFound(res)
        return
      }
      const { owner, repo, rest } = repoMatch
      const repoFixtures = fixtures.repos[`${owner}/${repo}`]

      // GET /repos/:owner/:repo — repo details, currently only read for its `default_branch`
      // (`fetchRepoDefaultBranch`, the create-PR form's base-branch default). No fixture to
      // configure it: every scenario using this so far picks its own base explicitly instead of
      // relying on the default, so a fixed answer is enough.
      if (req.method === 'GET' && rest.length === 0) {
        sendJson(res, 200, { default_branch: 'main' })
        return
      }

      // GET /repos/:owner/:repo/pulls?state=open|closed
      if (req.method === 'GET' && rest.length === 1 && rest[0] === 'pulls') {
        const state = url.searchParams.get('state') ?? 'open'
        const list = state === 'closed' ? repoFixtures?.closedPulls : repoFixtures?.openPulls
        sendJson(res, 200, list ?? [])
        return
      }

      // POST /repos/:owner/:repo/pulls — creates a new PR (`usePrCreateFlow`/`usePrPublishFlow`).
      // Like the issue-create route, the repo may not have been configured at all yet.
      if (req.method === 'POST' && rest.length === 1 && rest[0] === 'pulls') {
        const body = await readBody(req)
        const input = JSON.parse(body) as {
          title?: string
          head?: string
          base?: string
          body?: string
          draft?: boolean
        }
        const key = `${owner}/${repo}`
        const target = (fixtures.repos[key] ??= {})
        const numbers = [...(target.openPulls ?? []), ...(target.closedPulls ?? [])].map(
          (p) => p.number
        )
        const number = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
        const pr: FakePr = {
          number,
          node_id: `pr-node-${number}`,
          title: input.title ?? '',
          body: input.body ?? null,
          html_url: `https://github.com/${owner}/${repo}/pull/${number}`,
          state: 'open',
          draft: !!input.draft,
          merged_at: null,
          user: { login: 'octocat', avatar_url: 'https://example.invalid/octocat.png' },
          requested_reviewers: [],
          assignees: [],
          labels: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          base: { ref: input.base },
          head: { ref: input.head },
          mergeable: true,
          mergeable_state: 'clean',
        }
        target.openPulls = [...(target.openPulls ?? []), pr]
        sendJson(res, 201, pr)
        return
      }

      // GET /repos/:owner/:repo/pulls/:number
      if (req.method === 'GET' && rest.length === 2 && rest[0] === 'pulls') {
        const number = Number(rest[1])
        const pr =
          repoFixtures?.openPulls?.find((p) => p.number === number) ??
          repoFixtures?.closedPulls?.find((p) => p.number === number)
        if (!pr) {
          notFound(res)
          return
        }
        sendJson(res, 200, pr)
        return
      }

      // GET /repos/:owner/:repo/pulls/:number/files
      if (req.method === 'GET' && rest.length === 3 && rest[0] === 'pulls' && rest[2] === 'files') {
        const number = Number(rest[1])
        sendJson(res, 200, repoFixtures?.files?.[number] ?? [])
        return
      }

      // GET /repos/:owner/:repo/issues/:number/comments
      if (
        req.method === 'GET' &&
        rest.length === 3 &&
        rest[0] === 'issues' &&
        rest[2] === 'comments'
      ) {
        const number = Number(rest[1])
        sendJson(res, 200, repoFixtures?.comments?.[number] ?? [])
        return
      }

      // GET /repos/:owner/:repo/issues?state=open — also what a GitHub-backed board re-reads its
      // card list from, so a label added below is visible to the very next call of this same route.
      if (req.method === 'GET' && rest.length === 1 && rest[0] === 'issues') {
        sendJson(res, 200, repoFixtures?.openIssues ?? [])
        return
      }

      // GET /repos/:owner/:repo/issues/:number — the single-issue detail endpoint (`useIssueDetail`,
      // "Mirrors usePrDetail"), distinct from the list above.
      if (req.method === 'GET' && rest.length === 2 && rest[0] === 'issues') {
        const number = Number(rest[1])
        const issue = repoFixtures?.openIssues?.find((i) => i.number === number)
        if (!issue) {
          notFound(res)
          return
        }
        sendJson(res, 200, issue)
        return
      }

      // POST /repos/:owner/:repo/issues/:number/labels — mutates the matching issue or PR in place
      // (they share the same number space), so the next read reflects it with no extra seeding.
      if (
        req.method === 'POST' &&
        rest.length === 3 &&
        rest[0] === 'issues' &&
        rest[2] === 'labels'
      ) {
        const number = Number(rest[1])
        const body = await readBody(req)
        const { labels: newLabels = [] } = JSON.parse(body) as { labels?: string[] }
        const entity = findEntityByNumber(repoFixtures, number)
        if (entity) {
          const existing = new Set((entity.labels ?? []).map((l) => l.name))
          for (const name of newLabels) existing.add(name)
          entity.labels = [...existing].map((name) => ({ name }))
        }
        sendJson(res, 200, entity?.labels ?? newLabels.map((name) => ({ name })))
        return
      }

      // DELETE /repos/:owner/:repo/issues/:number/labels/:name — the removeLabel counterpart.
      if (
        req.method === 'DELETE' &&
        rest.length === 4 &&
        rest[0] === 'issues' &&
        rest[2] === 'labels'
      ) {
        const number = Number(rest[1])
        const labelName = decodeURIComponent(rest[3])
        const entity = findEntityByNumber(repoFixtures, number)
        if (entity) entity.labels = (entity.labels ?? []).filter((l) => l.name !== labelName)
        sendJson(res, 200, entity?.labels ?? [])
        return
      }

      // POST /repos/:owner/:repo/issues/:number/comments — appends rather than replaces, so a
      // scenario can post through the real UI and see it survive the following refetch.
      if (
        req.method === 'POST' &&
        rest.length === 3 &&
        rest[0] === 'issues' &&
        rest[2] === 'comments'
      ) {
        const number = Number(rest[1])
        const body = await readBody(req)
        const { body: text = '' } = JSON.parse(body) as { body?: string }
        if (!repoFixtures) {
          notFound(res)
          return
        }
        const comment: FakeComment = {
          id: (repoFixtures.comments?.[number]?.length ?? 0) + 1,
          body: text,
          html_url: `https://github.com/${owner}/${repo}/pull/${number}#issuecomment`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user: { login: 'octocat', avatar_url: 'https://example.invalid/octocat.png' },
        }
        repoFixtures.comments = repoFixtures.comments ?? {}
        repoFixtures.comments[number] = [...(repoFixtures.comments[number] ?? []), comment]
        sendJson(res, 201, comment)
        return
      }

      // POST /repos/:owner/:repo/pulls/:number/reviews — reflects the review's verdict onto
      // `mergeability.reviewDecision`, the field `PrChecksBox`'s review row actually reads.
      if (
        req.method === 'POST' &&
        rest.length === 3 &&
        rest[0] === 'pulls' &&
        rest[2] === 'reviews'
      ) {
        const number = Number(rest[1])
        const body = await readBody(req)
        const { event = 'COMMENT' } = JSON.parse(body) as { event?: string }
        const m = repoFixtures?.mergeability?.[number]
        if (m) {
          m.reviewDecision =
            event === 'APPROVE'
              ? 'APPROVED'
              : event === 'REQUEST_CHANGES'
                ? 'CHANGES_REQUESTED'
                : (m.reviewDecision ?? null)
        }
        sendJson(res, 200, { id: 1, state: event })
        return
      }

      // PUT /repos/:owner/:repo/pulls/:number/merge
      if (req.method === 'PUT' && rest.length === 3 && rest[0] === 'pulls' && rest[2] === 'merge') {
        const number = Number(rest[1])
        const pr = findPrByNumber(repoFixtures, number)
        if (pr) {
          pr.merged_at = new Date().toISOString()
          pr.state = 'closed'
        }
        sendJson(res, 200, {
          sha: 'mergedsha0000000000000000000000000000',
          merged: true,
          message: 'Pull Request successfully merged',
        })
        return
      }

      // PATCH /repos/:owner/:repo/pulls/:number — title/body/state edits.
      if (req.method === 'PATCH' && rest.length === 2 && rest[0] === 'pulls') {
        const number = Number(rest[1])
        const body = await readBody(req)
        const patch = JSON.parse(body) as Partial<FakePr>
        const pr = findPrByNumber(repoFixtures, number)
        if (!pr) {
          notFound(res)
          return
        }
        Object.assign(pr, patch)
        sendJson(res, 200, pr)
        return
      }

      // PUT /repos/:owner/:repo/pulls/:number/update-branch — simulates GitHub completing the
      // update by clearing the BEHIND status, so the UI's "Update branch" row has an observable
      // before/after once the write's refetch lands.
      if (
        req.method === 'PUT' &&
        rest.length === 3 &&
        rest[0] === 'pulls' &&
        rest[2] === 'update-branch'
      ) {
        const number = Number(rest[1])
        const m = repoFixtures?.mergeability?.[number]
        if (m) m.mergeStateStatus = 'CLEAN'
        sendJson(res, 202, { message: 'Updating pull request branch.' })
        return
      }

      // POST/DELETE /repos/:owner/:repo/pulls/:number/requested_reviewers
      if (
        (req.method === 'POST' || req.method === 'DELETE') &&
        rest.length === 3 &&
        rest[0] === 'pulls' &&
        rest[2] === 'requested_reviewers'
      ) {
        const number = Number(rest[1])
        const body = await readBody(req)
        const { reviewers = [] } = JSON.parse(body) as { reviewers?: string[] }
        const pr = findPrByNumber(repoFixtures, number)
        if (pr) {
          const byLogin = new Map((pr.requested_reviewers ?? []).map((u) => [u.login, u]))
          if (req.method === 'POST') {
            for (const login of reviewers) {
              byLogin.set(login, { login, avatar_url: 'https://example.invalid/avatar.png' })
            }
          } else {
            for (const login of reviewers) byLogin.delete(login)
          }
          pr.requested_reviewers = [...byLogin.values()]
        }
        sendJson(res, 200, pr ?? {})
        return
      }

      // POST/DELETE /repos/:owner/:repo/issues/:number/assignees
      if (
        (req.method === 'POST' || req.method === 'DELETE') &&
        rest.length === 3 &&
        rest[0] === 'issues' &&
        rest[2] === 'assignees'
      ) {
        const number = Number(rest[1])
        const body = await readBody(req)
        const { assignees = [] } = JSON.parse(body) as { assignees?: string[] }
        const pr = findPrByNumber(repoFixtures, number)
        if (pr) {
          const byLogin = new Map((pr.assignees ?? []).map((u) => [u.login, u]))
          if (req.method === 'POST') {
            for (const login of assignees) {
              byLogin.set(login, { login, avatar_url: 'https://example.invalid/avatar.png' })
            }
          } else {
            for (const login of assignees) byLogin.delete(login)
          }
          pr.assignees = [...byLogin.values()]
        }
        sendJson(res, 200, pr ?? {})
        return
      }

      // GET /repos/:owner/:repo/assignees — the reviewer/assignee edit popover's candidate pool.
      if (req.method === 'GET' && rest.length === 1 && rest[0] === 'assignees') {
        sendJson(res, 200, repoFixtures?.assignableUsers ?? [])
        return
      }

      // GET /repos/:owner/:repo/labels — the label edit popover's candidate pool.
      if (req.method === 'GET' && rest.length === 1 && rest[0] === 'labels') {
        sendJson(res, 200, repoFixtures?.repoLabels ?? [])
        return
      }

      notFound(res)
    })()
  })

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}

/** Merges repo fixtures into the running suite-wide server — called from step definitions, which run
 * in a different OS process than the server itself (see this module's own doc comment), hence a real
 * HTTP round-trip rather than a direct call. */
export async function configureFakeGithubFixtures(
  fixturesToApply: FakeGithubFixtures
): Promise<void> {
  const res = await fetch(`${SUITE_WIDE_FAKE_GITHUB_URL}/__configure`, {
    method: 'POST',
    body: JSON.stringify(fixturesToApply),
  })
  if (!res.ok) throw new Error(`configureFakeGithubFixtures: server answered ${res.status}`)
}

/** Clears every configured fixture — pair with an `After` hook on `@github-mock` scenarios so one
 * scenario's fixtures can never leak into the next. */
export async function resetFakeGithubFixtures(): Promise<void> {
  const res = await fetch(`${SUITE_WIDE_FAKE_GITHUB_URL}/__reset`, { method: 'POST' })
  if (!res.ok) throw new Error(`resetFakeGithubFixtures: server answered ${res.status}`)
}
