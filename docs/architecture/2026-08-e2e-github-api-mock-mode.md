# ADR: e2e GitHub API mock mode — mechanism choice

**Status:** implemented (2026-08) — all three scenarios named in
[issue #425](https://github.com/Tlahey/git-manager/issues/425) (the PR detail view, "add issue to
board", and "remove my merged branches") now exercise a real `github_api_request` round trip.

## Context

Several real, working features are undocumented and e2e-untested because they need a genuinely
successful GitHub API round-trip, which the e2e suite has no way to fake: the pull request detail
view (`PrDetailCenter` and its family), "Add issue to board", and "Remove my merged branches"
(mine-only scope) all require a truthy `accountId` _and_ a successful fetch before they render
anything real.

Investigation confirmed the frontend never calls GitHub directly: every `api/github/*.api.ts` call
funnels through `ghRequest`/`ghGraphQL` (`apps/desktop/src/api/github/githubApiShared.ts`) → the
`github_api_request` Tauri command → `github_api::request()`
(`apps/desktop/src-tauri/src/services/github_api.rs`), which is the single place a request actually
leaves the process. That function calls `guard_url()` first, which hard-rejects any URL not starting
with `https://api.github.com/` — the load-bearing anti-exfiltration check documented in the module's
own doc comment (the frontend can only ever name an account id, never see a token; a compromised
frontend naming its own collector host must not be able to walk off with the credential).

Two mocking mechanisms were considered at that same choke point:

1. **Network redirect** — under the existing `e2e` Cargo feature (`apps/desktop/src-tauri/Cargo.toml`,
   already used to gate `tauri-plugin-wdio`), read an env var (`GIT_MANAGER_GITHUB_API_BASE_URL`)
   _after_ `guard_url` has validated the frontend's literal `https://api.github.com/...` URL, and
   rewrite only the outbound request's origin to a local fake HTTP server. Rust stays a dumb relay;
   canned JSON responses live in a new `apps/e2e/support/fakeGithubServer.ts`, mirroring the existing
   `fakeAiServer.ts` (a plain `http.createServer` the app's real Settings/AI plumbing is pointed at —
   no IPC mocking involved, see `command-mocking.feature`'s note on why `browser.tauri.mock` can't
   intercept the app's own `invoke` calls triggered by a real click).
2. **In-Rust short-circuit** — under the same feature flag, match `(method, url, body)` directly
   inside `request()` and return a synthetic `GithubApiResponse` with no network call at all.

## Decision

**Network redirect (option 1).**

- Consistent with the only existing precedent for faking an external API in this suite
  (`fakeAiServer.ts`): the app's real AI provider URL is a user setting repointed at a local server,
  and every AI e2e scenario asserts against a real HTTP round-trip, not an injected in-process
  response. The GitHub case has no equivalent user-facing setting (the URL is hardcoded), so the
  redirect is a Rust-side rewrite instead of a settings write — but the shape of "a real local server
  answers a real HTTP request" is preserved.
- Keeps `github_api.rs` thin, as its own module doc comment already commits to ("the only place a
  token is ever read", not "the only place a response is decided"). Response-shaping logic and canned
  fixture data belong beside the e2e scenarios that need specific data per test (TypeScript,
  `apps/e2e/`), not compiled into the Rust binary behind a feature flag — matching how AI feature
  instructions/fixtures live in `packages/ai` and e2e fixtures respectively, never in Rust.
- `guard_url` itself is untouched: the redirect only rewrites the request _after_ the guard already
  accepted a literal `https://api.github.com/...` URL, so the anti-exfiltration property (a frontend
  cannot name its own collector) holds exactly as before, in every build. Production builds compile
  out the redirect entirely (`#[cfg(not(feature = "e2e"))]` is the identity function and never reads
  the env var), so there is no new attack surface outside `build:e2e`.
- The one thing option 2 would have bought — no local server process/port to manage — is a small
  saving next to the ergonomics lost: per-scenario response customization (matching `fakeAiServer.ts`'s
  `options.dailySummary`/`options.groupingMessage` pattern) is natural for a TS server constructed
  per test, and awkward for data threaded through an env var into Rust.

## Consequences

- `request()` in `github_api.rs` gains a small `#[cfg(feature = "e2e")]`-gated origin-rewrite step
  between `guard_url(url)?` and building the `reqwest` request, covered by unit tests asserting the
  rewrite only ever fires under the feature flag and only for a `GIT_MANAGER_GITHUB_API_BASE_URL`
  that was actually set (both directions: present-and-blank, and absent).
- `apps/e2e/support/fakeGithubServer.ts` mirrors `fakeAiServer.ts`'s shape: REST paths matched by URL,
  GraphQL POSTs to `/graphql` matched by a distinguishing substring in the query text (the same
  technique `fakeAiServer.ts` uses to tell completion features apart by JSON schema name). Unlike the
  AI server, it also has to be reconfigurable from a worker process it doesn't share memory with (see
  its own doc comment) — `POST /__configure`/`POST /__reset` are a small control plane the server
  answers over the same loopback connection every real request uses.
- **Update (2026-08-24, issue #436):** `fetch_user` (the PAT/device-flow login path's `GET /user` and
  `GET /user/emails` calls) is now also redirected — it calls `e2e_redirect` directly rather than
  going through `request()`/`github_api_request`, since it runs before there is an account id to
  attach a token under. `github_device_code`/`github_poll_token` (`commands/github.rs`, the
  `github.com` OAuth-host calls) remain un-redirected: they're a different origin from
  `api.github.com`, out of `guard_url`'s allowlist entirely, and the existing invalid-device-code
  coverage has no need of a fake response. `fakeGithubServer.ts`'s `/user` route answers 401 by
  default (matching real GitHub's response to a token it doesn't recognize) so the existing
  invalid-PAT scenario (`settings-integrations.feature`) stays deterministic without a fixture, and
  only returns a profile once a scenario configures one via `/__configure`.
- **All three scenarios are implemented**: the PR detail view (`apps/e2e/features/pr-detail-view.feature`,
  opened via the toolbar's real pull-request status tag), "add issue to board"
  (`apps/e2e/features/board-github.feature`'s second scenario, exercising the real remote board
  backend end to end, including the label write that makes the added card actually appear), and
  "remove my merged branches" (`apps/e2e/features/branch-cleanup.feature`'s fourth scenario, matching
  a merged pull request's real author against the connected account). Shared setup (a fake GitHub
  remote, a connected account with a fake token, and three fixture-seeding steps — an open PR, an
  open issue, a merged PR) lives in `apps/e2e/step-definitions/github-mock.steps.ts`, tagged
  `@github-mock` — its own `After` hook resets both the server's fixtures and the seeded account,
  since this suite shares one app window across every feature and a leftover account silently
  changes what unrelated scenarios (e.g. the Launchpad's demo-data fallback) see.
- **First reuse, confirming the infra generalizes**: `apps/e2e/features/launchpad-issues.feature`'s
  "Opening an issue's detail panel" — `IssueDetailCenter`/`useIssueDetail` are, per their own doc
  comment, "a straight copy of `usePrDetail`", so this needed only two more REST routes
  (`GET /search/issues`, `GET /repos/:owner/:repo/issues/:number`) added to `fakeGithubServer.ts`,
  no changes to the redirect or the account-seeding steps. The one new wrinkle: the Launchpad's
  cross-repo issue list (`useGitHubRepoIssues`) only fetches for repos in the dashboard's saved-
  projects list, which a dev fixture is deliberately kept out of — a new
  `Given the repository is a saved project` step seeds `git-manager-repos` directly, reusing
  `daily-summary.steps.ts`'s retry-and-verify shape for the same reason it exists there (a lingering
  page's own `setRepoCache` can otherwise clobber the seed).

## Alternatives rejected

- **IPC-layer command mocking** (`browser.tauri.mock`) — already ruled out by
  `command-mocking.feature`: this Tauri/webview build's `@wdio/tauri-plugin` cannot patch
  `window.__TAURI__.core.invoke`, so a mock never intercepts a call the app's own UI code triggers via
  a real click (only calls a test explicitly drives through `browser.tauri.execute` are reachable that
  way).
- **A new `github.apiBaseUrl` user setting**, mirroring how the AI provider URL is repointed — rejected
  because every `api/github/*.api.ts` call site hardcodes the literal string
  `https://api.github.com/...`, and `guard_url` is deliberately not configurable (its whole point is
  that the allowed origin is not data). Introducing a setting would mean either weakening that
  guarantee or having the setting do nothing outside `e2e` builds, which is a more confusing shape
  than a Rust-only env var that literally does not exist in a release binary.
