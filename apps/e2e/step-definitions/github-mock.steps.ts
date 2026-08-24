import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'
import { browser } from '@wdio/globals'
import { Given, After } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'
import { seedSettings, forceLiveSettings } from '../support/settings'
import { navigateAndSettle } from '../support/navigation'
import { configureFakeGithubFixtures, resetFakeGithubFixtures } from '../support/fakeGithubServer'
import type { FakePr, FakeIssue, FakeComment, FakeReviewThread } from '../support/fakeGithubServer'

/**
 * Shared setup for scenarios exercising the e2e GitHub API mock mode (issue #425,
 * `docs/architecture/2026-08-e2e-github-api-mock-mode.md`): pointing a fixture repo at a fake
 * `owner/repo`, connecting an account with a token the mock server will actually accept, and seeding
 * that server's fixtures. Feature-specific assertions (what a scenario expects to see once the data
 * loads) live in that feature's own step-definitions file — this one only gets a scenario to the
 * point where a real `github_api_request` round-trip can succeed.
 */

/**
 * A second remote purely so `firstGitHubOwnerRepo` (checked against every remote URL of the repo,
 * not just `origin`) resolves one — the fixture repos' real `origin` stays a local filesystem path
 * (see `tools/git-fixtures/scenarios/*.sh`) because fetch/push/pull scenarios need it to actually
 * work. This remote is never fetched from; the app only ever reads its URL to parse `owner/repo`.
 */
Given(/^the repository has a GitHub remote "([^"]*)"$/, async (ownerRepo: string) => {
  const repoPath = getActiveRepoPath()
  execFileSync('git', [
    '-C',
    repoPath,
    'remote',
    'add',
    'gh-mock',
    `https://github.com/${ownerRepo}.git`,
  ])
})

/**
 * Registers the already-opened fixture repo in the dashboard's saved-projects list
 * (`git-manager-repos`'s `savedRepos`) — a dev fixture is deliberately kept out of that persisted
 * list (it must never leak into a real `pnpm dev` session), but `useGitHubRepoIssues` (the
 * Launchpad's cross-repo issue list) only fetches for saved repos, so a scenario that needs a real
 * GitHub round trip there has to add itself explicitly.
 *
 * Same retry-and-verify shape as `daily-summary.steps.ts`'s equivalent seed, for the same reason:
 * the previous reload's `apiOpenRepo` resolution can still be in flight when this write lands, and
 * its own `setRepoCache` call makes zustand-persist rewrite the whole `git-manager-repos` snapshot
 * from memory — silently clobbering a `savedRepos` seed written a moment too early.
 */
Given(/^the repository is a saved project$/, async () => {
  const repoPath = getActiveRepoPath()
  const name = basename(repoPath)
  for (let attempt = 1; attempt <= 3; attempt++) {
    const stamp = `saved-project-${Date.now()}-${attempt}`
    const origin = await browser.execute(() => window.location.origin)
    await browser.execute(
      (path: string, repoName: string) => {
        localStorage.setItem(
          'git-manager-repos',
          JSON.stringify({
            state: { savedRepos: [{ path, name: repoName, pinned: false }], discoveredRepos: [] },
            version: 0,
          })
        )
      },
      repoPath,
      name
    )
    await navigateAndSettle(`${origin}/?e2e=${stamp}`, stamp)
    const seedSurvived = await browser.execute((path: string) => {
      try {
        const raw = localStorage.getItem('git-manager-repos')
        const saved = raw ? JSON.parse(raw)?.state?.savedRepos : null
        return Array.isArray(saved) && saved.some((r: { path?: string }) => r?.path === path)
      } catch {
        return false
      }
    }, repoPath)
    if (seedSurvived) return
  }
  throw new Error('Seeding the repository into git-manager-repos was clobbered on every attempt')
})

/**
 * Same as "a GitHub account ... is connected" (settings.steps.ts) — seeding only the account's
 * public half — plus a fake token filed under the same id via the real `store_credential` command
 * (not a mock: see command-mocking.feature's own note on why a real call through
 * `browser.tauri.execute` is the one thing this suite *can* drive directly). Meaningless without the
 * GitHub API mock mode also being active: `require_secret` will happily hand this token to a real
 * `api.github.com` request too, which would just get GitHub's own 401.
 */
Given(/^a GitHub account "([^"]*)" is connected with a fake API token$/, async (login: string) => {
  await seedSettings({
    github: {
      accounts: [
        {
          id: login,
          user: { login, name: null, email: null, avatarUrl: 'https://example.invalid/avatar.png' },
        },
      ],
      activeAccountId: login,
    },
  })
  await browser.tauri.execute(
    async ({ core }, args: { login: string }) => {
      await core.invoke('store_credential', {
        kind: 'github',
        id: args.login,
        secret: 'fake-e2e-github-token',
      })
    },
    { login }
  )
})

/**
 * One open pull request, with every sub-resource `PrDetailCenter`'s default (files panel open) render
 * needs already filled with an empty-but-valid answer — comments, mergeability, review threads, and
 * per-file viewed state — so a scenario only has to say what's *interesting* about its PR rather than
 * re-stating "and there are no comments" every time. `filesChangedCount` files are generated with
 * predictable names so a scenario can assert on the files panel without a separate fixture step.
 */
Given(
  /^the GitHub mock server has an open pull request "(\d+)" on branch "([^"]*)" titled "([^"]*)" in "([^"]*)"$/,
  async (numberStr: string, branch: string, title: string, ownerRepo: string) => {
    const number = Number(numberStr)
    const pr: FakePr = {
      number,
      // Same id `filesViewedState.pullRequestId` below uses — required by the draft-toggle
      // GraphQL mutations, which key off this rather than owner/repo/number.
      node_id: `pr-node-${number}`,
      title,
      body: 'Fixture pull request body.',
      html_url: `https://github.com/${ownerRepo}/pull/${number}`,
      state: 'open',
      draft: false,
      merged_at: null,
      user: { login: 'octocat', avatar_url: 'https://example.invalid/octocat.png' },
      requested_reviewers: [],
      assignees: [],
      labels: [],
      changed_files: 1,
      additions: 3,
      deletions: 1,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-02T00:00:00Z',
      comments: 0,
      base: { ref: 'main', sha: 'basesha0000000000000000000000000000000' },
      head: { ref: branch, sha: 'headsha0000000000000000000000000000000' },
      mergeable: true,
      mergeable_state: 'clean',
    }
    await configureFakeGithubFixtures({
      repos: {
        [ownerRepo]: {
          openPulls: [pr],
          comments: { [number]: [] },
          files: {
            [number]: [
              { filename: 'app.txt', status: 'modified', additions: 3, deletions: 1, changes: 4 },
            ],
          },
          mergeability: {
            [number]: {
              mergeable: 'MERGEABLE',
              mergeStateStatus: 'CLEAN',
              reviewDecision: null,
              viewerCanMergeAsAdmin: false,
            },
          },
          reviewThreads: { [number]: [] },
          filesViewedState: { [number]: { pullRequestId: `pr-node-${number}`, viewedByPath: {} } },
        },
      },
    })
  }
)

/**
 * One merged (closed, `merged_at` set) pull request, for the "remove my merged branches" flow —
 * `useMergedBranches`' second GitHub signal (`fetchClosedPullRequests`, matched on `head.ref` +
 * `merged_at`). The commit-based first signal (`commits/:sha/pulls`) isn't implemented by this fake
 * server and 404s, which `fetchCommitMergedPullRequestForBranch` already treats as "no match" — this
 * fixture is what the hook actually finds a branch through.
 */
Given(
  /^the GitHub mock server has a merged pull request "(\d+)" on branch "([^"]*)" authored by "([^"]*)" in "([^"]*)"$/,
  async (numberStr: string, branch: string, author: string, ownerRepo: string) => {
    const number = Number(numberStr)
    const pr: FakePr = {
      number,
      title: 'Fixture merged pull request',
      html_url: `https://github.com/${ownerRepo}/pull/${number}`,
      state: 'closed',
      draft: false,
      merged_at: '2026-08-03T00:00:00Z',
      user: { login: author, avatar_url: 'https://example.invalid/avatar.png' },
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-03T00:00:00Z',
      head: { ref: branch },
    }
    await configureFakeGithubFixtures({ repos: { [ownerRepo]: { closedPulls: [pr] } } })
  }
)

/** One open issue, for the "add an existing issue to the board" flow. */
Given(
  /^the GitHub mock server has an open issue "(\d+)" titled "([^"]*)" in "([^"]*)"$/,
  async (numberStr: string, title: string, ownerRepo: string) => {
    const number = Number(numberStr)
    const issue: FakeIssue = {
      number,
      title,
      body: 'Fixture issue body.',
      html_url: `https://github.com/${ownerRepo}/issues/${number}`,
      state: 'open',
      user: { login: 'octocat', avatar_url: 'https://example.invalid/octocat.png' },
      labels: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      comments: 0,
    }
    await configureFakeGithubFixtures({ repos: { [ownerRepo]: { openIssues: [issue] } } })
  }
)

/** Adds one issue-style comment to an already-seeded PR — for scenarios reading `usePrComments`.
 * Replaces (not appends to) that PR's comments, so it should follow the "open pull request" step,
 * whose empty `comments: {[number]: []}` this then overrides with the one comment given here. */
Given(
  /^the GitHub mock server pull request "(\d+)" in "([^"]*)" has a comment "([^"]*)" from "([^"]*)"$/,
  async (numberStr: string, ownerRepo: string, body: string, login: string) => {
    const number = Number(numberStr)
    const comment: FakeComment = {
      id: 1,
      body,
      html_url: `https://github.com/${ownerRepo}/pull/${number}#issuecomment-1`,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      user: { login, avatar_url: 'https://example.invalid/avatar.png' },
    }
    await configureFakeGithubFixtures({
      repos: { [ownerRepo]: { comments: { [number]: [comment] } } },
    })
  }
)

/** Adds one unresolved review thread to an already-seeded PR — for `usePrReviewThreads`/
 * `PrCodeSuggestions`, which only render once there is at least one unresolved thread. */
Given(
  /^the GitHub mock server pull request "(\d+)" in "([^"]*)" has an unresolved review thread on "([^"]*)" from "([^"]*)" saying "([^"]*)"$/,
  async (numberStr: string, ownerRepo: string, path: string, login: string, text: string) => {
    const number = Number(numberStr)
    const thread: FakeReviewThread = {
      id: `thread-${number}-1`,
      isResolved: false,
      isOutdated: false,
      path,
      line: 1,
      author: login,
      bodyText: text,
      url: `https://github.com/${ownerRepo}/pull/${number}#discussion_r1`,
    }
    await configureFakeGithubFixtures({
      repos: { [ownerRepo]: { reviewThreads: { [number]: [thread] } } },
    })
  }
)

/** Marks an already-seeded PR as behind its base branch — for the "Update branch" action
 * (`PrChecksBox`'s `pr-checks-behind` row only renders when `mergeStateStatus` is `BEHIND`). */
Given(
  /^the GitHub mock server pull request "(\d+)" in "([^"]*)" is behind its base branch$/,
  async (numberStr: string, ownerRepo: string) => {
    const number = Number(numberStr)
    await configureFakeGithubFixtures({
      repos: {
        [ownerRepo]: {
          mergeability: {
            [number]: {
              mergeable: 'MERGEABLE',
              mergeStateStatus: 'BEHIND',
              reviewDecision: null,
              viewerCanMergeAsAdmin: false,
            },
          },
        },
      },
    })
  }
)

/** One candidate in the repo's assignable-users pool — the reviewer/assignee edit popover's
 * candidate list (`fetchAssignableUsers`, `GET .../assignees`). */
Given(
  /^the GitHub mock server "([^"]*)" has an assignable user "([^"]*)"$/,
  async (ownerRepo: string, login: string) => {
    await configureFakeGithubFixtures({
      repos: {
        [ownerRepo]: {
          assignableUsers: [{ login, avatar_url: 'https://example.invalid/avatar.png' }],
        },
      },
    })
  }
)

/** One candidate in the repo's label pool — the label edit popover's candidate list
 * (`fetchRepoLabels`, `GET .../labels`). */
Given(
  /^the GitHub mock server "([^"]*)" has a label "([^"]*)"$/,
  async (ownerRepo: string, name: string) => {
    await configureFakeGithubFixtures({ repos: { [ownerRepo]: { repoLabels: [{ name }] } } })
  }
)

/** Links an open PR to the fixture repo's actual current HEAD commit — the commit-graph's PR badge
 * (`useCommitPullRequest`) is looked up by real SHA, unlike every other fixture here, which a
 * scenario picks a number for itself. Reads the real SHA off disk rather than asking the scenario
 * for one, since a fixture repo's HEAD isn't something a `.feature` file should have to know. */
Given(
  /^the GitHub mock server has a pull request "(\d+)" titled "([^"]*)" for the newest commit in "([^"]*)"$/,
  async (numberStr: string, title: string, ownerRepo: string) => {
    const number = Number(numberStr)
    const sha = execFileSync('git', ['-C', getActiveRepoPath(), 'rev-parse', 'HEAD'])
      .toString()
      .trim()
    const pr: FakePr = {
      number,
      title,
      html_url: `https://github.com/${ownerRepo}/pull/${number}`,
      state: 'open',
      draft: false,
      merged_at: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-02T00:00:00Z',
    }
    await configureFakeGithubFixtures({
      repos: { [ownerRepo]: { openPulls: [pr], commitPulls: { [sha]: [number] } } },
    })
  }
)

/** Same as above, but merged — for the badge's other icon/colour variant
 * (`CommitHeaderInfo.tsx`'s `commitPr.merged` branch). */
Given(
  /^the GitHub mock server has a merged pull request "(\d+)" titled "([^"]*)" for the newest commit in "([^"]*)"$/,
  async (numberStr: string, title: string, ownerRepo: string) => {
    const number = Number(numberStr)
    const sha = execFileSync('git', ['-C', getActiveRepoPath(), 'rev-parse', 'HEAD'])
      .toString()
      .trim()
    const pr: FakePr = {
      number,
      title,
      html_url: `https://github.com/${ownerRepo}/pull/${number}`,
      state: 'closed',
      draft: false,
      merged_at: '2026-08-03T00:00:00Z',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-03T00:00:00Z',
    }
    await configureFakeGithubFixtures({
      repos: { [ownerRepo]: { closedPulls: [pr], commitPulls: { [sha]: [number] } } },
    })
  }
)

/** Reviewer/checks rollup for one PR — the sidebar's hover card (`fetchPrReviewSummary`). Fixed
 * shape (one approving reviewer, green checks) rather than parameterized, matching the rest of this
 * file's fixture steps: a scenario states which PR needs a summary, not what the summary contains. */
Given(
  /^the GitHub mock server has a review summary for pull request "(\d+)" in "([^"]*)"$/,
  async (numberStr: string, ownerRepo: string) => {
    const number = Number(numberStr)
    await configureFakeGithubFixtures({
      repos: {
        [ownerRepo]: {
          reviewSummaries: {
            [number]: {
              reviewDecision: 'APPROVED',
              reviewers: [
                {
                  login: 'hubot',
                  avatarUrl: 'https://example.invalid/hubot.png',
                  state: 'APPROVED',
                },
              ],
              checksState: 'SUCCESS',
            },
          },
        },
      },
    })
  }
)

// So one scenario's fixtures (a specific PR/issue number, a specific title) can never leak into the
// next — the server is suite-wide and outlives any single scenario (see fakeGithubServer.ts). This
// also has to undo "a GitHub account ... is connected with a fake API token": the suite drives one
// shared app window through every feature (see settings.ts's own note on this), so a fake account
// left in `settings.github` silently switches later, unrelated scenarios — `launchpad-prs.feature`'s
// demo-data assertions, in particular — from `useGitHubData`'s deterministic mock fallback onto a
// real fetch this server no longer has fixtures for. Both the persisted copy (for a scenario that
// reloads next) and the live store (for one that doesn't) are cleared, matching `seedSettings`/
// `forceLiveSettings`'s own split.
After({ tags: '@github-mock' }, async () => {
  await resetFakeGithubFixtures()
  const clearedGithub = { github: { accounts: [], activeAccountId: null } }
  await seedSettings(clearedGithub)
  await forceLiveSettings(clearedGithub)
})
