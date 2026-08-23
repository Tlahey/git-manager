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

function handleGraphQL(body: string, res: http.ServerResponse): void {
  let parsed: { query?: string; variables?: { owner?: string; repo?: string; number?: number } }
  try {
    parsed = JSON.parse(body)
  } catch {
    sendJson(res, 400, { message: 'invalid JSON' })
    return
  }
  const { query = '', variables = {} } = parsed
  const { owner, repo, number } = variables
  const repoFixtures = owner && repo ? fixtures.repos[`${owner}/${repo}`] : undefined

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
 * Covers exactly the endpoints the currently-unblocked scenarios need (the PR detail view, and
 * adding an existing issue to a GitHub-backed board) — not a general GitHub API simulator. Extend
 * {@link FakeRepoFixtures}/the request handler here when a new scenario needs another endpoint,
 * the same way `fakeAiServer.ts` grew one branch per AI feature.
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
      // (`fetchGitHubRepoIssues`) and, for `is:pr`, its PR-list equivalent. Both narrow with a
      // `repo:owner/repo` qualifier this suite always includes, so that's the only part parsed;
      // `items` need a `repository_url` because `rawToMockIssue`/`rawToMockPR` derive `fullName`
      // from it for a search result, unlike the single-repo REST endpoints below.
      if (req.method === 'GET' && pathname === '/search/issues') {
        const q = url.searchParams.get('q') ?? ''
        const repoQualifier = /repo:(\S+)/.exec(q)?.[1]
        const isPr = /\bis:pr\b/.test(q)
        const repoFixturesForSearch = repoQualifier ? fixtures.repos[repoQualifier] : undefined
        const pool = isPr
          ? (repoFixturesForSearch?.openPulls ?? [])
          : (repoFixturesForSearch?.openIssues ?? [])
        const items = pool.map((item) => ({
          ...item,
          repository_url: repoQualifier
            ? `https://api.github.com/repos/${repoQualifier}`
            : undefined,
        }))
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

      // GET /repos/:owner/:repo/pulls?state=open|closed
      if (req.method === 'GET' && rest.length === 1 && rest[0] === 'pulls') {
        const state = url.searchParams.get('state') ?? 'open'
        const list = state === 'closed' ? repoFixtures?.closedPulls : repoFixtures?.openPulls
        sendJson(res, 200, list ?? [])
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

      // POST /repos/:owner/:repo/issues/:number/labels — mutates the matching issue in place, the
      // same way a real repository would, so the board's next read reflects it with no extra seeding.
      if (
        req.method === 'POST' &&
        rest.length === 3 &&
        rest[0] === 'issues' &&
        rest[2] === 'labels'
      ) {
        const number = Number(rest[1])
        const body = await readBody(req)
        const { labels: newLabels = [] } = JSON.parse(body) as { labels?: string[] }
        const issue = repoFixtures?.openIssues?.find((i) => i.number === number)
        if (issue) {
          const existing = new Set((issue.labels ?? []).map((l) => l.name))
          for (const name of newLabels) existing.add(name)
          issue.labels = [...existing].map((name) => ({ name }))
        }
        sendJson(res, 200, issue?.labels ?? newLabels.map((name) => ({ name })))
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
