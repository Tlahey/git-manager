/**
 * The invented pull requests, issues and contribution history — loaded only by a build that can
 * actually use them.
 *
 * They used to be imported at the top of `notification.store.ts`, `useGitHubRepoIssues.ts` and
 * `useGitHubData.ts`, which meant every shipped release carried six fake pull requests, four fake
 * issues and a 365-day random contribution generator that nothing in a release could ever reach.
 * The generator was not merely carried, it *ran*: `getMockContributions()` was called at module
 * scope, so a production start-up built a year of random numbers and threw them away.
 *
 * This module is the single place that names the fixture file, behind a condition made of literal
 * comparisons on build-time constants. Vite replaces both of them with literals, Rollup folds the
 * result to `false`, and the `import()` below becomes unreachable — so the fixtures are not in the
 * bundle at all rather than merely unused within it.
 */

import type { DayCommit, MockIssue, MockPR } from '../app/pull-requests/types'

/**
 * Whether this build could ever show the fixtures.
 *
 * Deliberately written as literal comparisons rather than reusing `envFlag()` from
 * `devFlags.store.ts`: a function call is not something the bundler will fold away, and folding is
 * the entire point here.
 *
 * - a development build, where the debug menu exists and can switch the flag on at any moment;
 * - any build whose `VITE_MOCK_GITHUB` explicitly asks for them, which is the documented way to pin
 *   a non-interactive run (e2e, a scripted demo) to a known set of pull requests.
 *
 * A release build satisfies neither, and `VITE_MOCK_GITHUB` being unset there is what lets the
 * whole expression fold.
 *
 * Note this is **wider** than that store's `DEFAULT_MOCK_GITHUB`, and has to be: a development
 * build *carries* the fixtures so the debug toggle has something to switch on, while defaulting to
 * not showing them. What a build can load and what it shows unasked are two different questions —
 * conflating them is what put a Launchpad full of invented pull requests in front of every
 * developer who ran `pnpm dev` without a GitHub account.
 */
export const DEV_FIXTURES_AVAILABLE =
  import.meta.env.DEV ||
  import.meta.env.VITE_MOCK_GITHUB === 'true' ||
  import.meta.env.VITE_MOCK_GITHUB === '1'

export interface DevFixtures {
  prs: MockPR[]
  issues: MockIssue[]
  /** A year of daily counts, generated once per load — see `getMockContributions`. */
  contributions: DayCommit[]
}

/**
 * The fixtures, or `null` in a build that has none.
 *
 * `null` is a real answer, not a failure: it is what a release build returns, and every caller
 * treats it as "there is nothing to show", which is exactly the empty list a user without a
 * connected GitHub account should get.
 */
export async function loadDevFixtures(): Promise<DevFixtures | null> {
  if (!DEV_FIXTURES_AVAILABLE) return null

  const { MOCK_PRS, MOCK_ISSUES, getMockContributions } =
    await import('../app/pull-requests/mockData')

  return {
    // Copies, not the shared array: `simulateChange` mutates what it is given, and a second load
    // would otherwise hand out pull requests carrying the first session's simulated changes.
    // Cloned per item with a spread rather than a JSON round-trip, which would turn
    // `createdAt`/`updatedAt` into strings and crash every consumer that sorts on
    // `pr.updatedAt.getTime()`.
    prs: MOCK_PRS.map((pr) => ({ ...pr })),
    issues: MOCK_ISSUES.map((issue) => ({ ...issue })),
    contributions: getMockContributions(),
  }
}
