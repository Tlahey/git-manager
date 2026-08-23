import { execFileSync } from 'node:child_process'
import { browser } from '@wdio/globals'
import { Given, After } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'
import { seedSettings, forceLiveSettings } from '../support/settings'
import { configureFakeGithubFixtures, resetFakeGithubFixtures } from '../support/fakeGithubServer'
import type { FakePr, FakeIssue } from '../support/fakeGithubServer'

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
