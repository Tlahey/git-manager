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
 * Default: on while developing, off everywhere else. That is a deliberate change of behaviour —
 * the fixtures used to appear for *anyone without a GitHub token*, so a user who simply had not
 * connected their account yet was shown ten invented pull requests, with invented authors and
 * titles, rendered exactly like real ones. The only hint was a small "no account" line in the
 * header. Fiction presented as fact is a worse first impression than an empty list, and the empty
 * list already reads well ("No pull requests" plus the same header line).
 *
 * `VITE_MOCK_GITHUB=true|false` overrides it, which is how e2e pins the Launchpad to a known set.
 */
const DEFAULT_MOCK_GITHUB =
  envFlag(import.meta.env.VITE_MOCK_GITHUB) ?? Boolean(import.meta.env.DEV)

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
