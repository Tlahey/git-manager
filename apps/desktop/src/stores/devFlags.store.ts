import { create } from 'zustand'

/**
 * Switches that only exist while developing.
 *
 * Runtime rather than build-time constants, because the point is to be able to flip them from the
 * footer's debug menu while the app is running — a `import.meta.env.*` check can only be decided
 * once, at build. Each one is *seeded* from an env variable so a non-interactive run (e2e, a
 * scripted demo) can force it without clicking anything.
 *
 * Nothing here is persisted: a flag that survived a restart would be a setting, and these are not
 * settings. In a production build the debug menu is dead-code-eliminated, so the defaults below
 * are the only values that can ever apply.
 */

/**
 * Reads a `VITE_*` variable as a tri-state: explicitly on, explicitly off, or unset.
 *
 * Unset has to be distinguishable from `false`, because "the developer said no" and "the developer
 * said nothing" want different defaults.
 */
function envFlag(value: unknown): boolean | undefined {
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return undefined
}

/**
 * Show the built-in mock pull requests instead of a real GitHub account's.
 *
 * **Off unless something explicitly asks for it**, in every build including a development one.
 * The fixtures used to appear for *anyone without a GitHub token*, so a user who had simply not
 * connected their account was shown ten invented pull requests, with invented authors and titles,
 * rendered exactly like real ones; that was narrowed to development builds, where it still meant a
 * developer running `pnpm dev` without an account got a Launchpad full of fiction labelled with a
 * single "showing demo data" line — the same defect one audience smaller. Fiction presented as
 * fact is a worse first impression than an empty page, and the signed-out page now says plainly
 * what is missing and how to fix it (`ConnectGithubBanner`).
 *
 * Two ways to arm them, both deliberate acts: `VITE_MOCK_GITHUB=true|false` at build time, which
 * is how e2e and the documentation capture pin the Launchpad to a known set (see
 * `apps/desktop/.env.e2e`), and the footer's debug menu at runtime, which is why a development
 * build still *carries* them (see `DEV_FIXTURES_AVAILABLE` in `lib/devFixtures.ts` — what a build
 * can load and what it shows by default are two different questions).
 */
const DEFAULT_MOCK_GITHUB = envFlag(import.meta.env.VITE_MOCK_GITHUB) ?? false

interface DevFlagsState {
  mockGitHub: boolean
  setMockGitHub: (value: boolean) => void
}

export const useDevFlagsStore = create<DevFlagsState>((set) => ({
  mockGitHub: DEFAULT_MOCK_GITHUB,
  setMockGitHub: (mockGitHub) => set({ mockGitHub }),
}))

/** The default the store starts from, exported so tests can assert what a build ships with. */
export const DEV_FLAG_DEFAULTS = { mockGitHub: DEFAULT_MOCK_GITHUB } as const

export { envFlag }
