import { useEffect } from 'react'
import { useDevFixturesStore } from '../stores/devFixtures.store'
import { useDevFlagsStore } from '../stores/devFlags.store'

/**
 * Arms the development fixtures when — and only when — the `mockGitHub` flag asks for them.
 *
 * The flag can be switched on at any point from the footer's debug menu, not just at start-up, so
 * this watches it rather than loading once. `load()` is idempotent and de-duplicated across
 * callers, which matters because both GitHub data hooks call this and either may mount first.
 *
 * Returns the fixtures as they currently stand: empty on the first render even in development,
 * since the module arrives asynchronously. Every consumer already has to render an empty list —
 * that is what a user with no connected account sees — so there is nothing extra to handle.
 */
export function useDevFixtures() {
  const mockGitHub = useDevFlagsStore((s) => s.mockGitHub)
  const load = useDevFixturesStore((s) => s.load)
  const issues = useDevFixturesStore((s) => s.issues)
  const contributions = useDevFixturesStore((s) => s.contributions)

  useEffect(() => {
    if (mockGitHub) void load()
  }, [mockGitHub, load])

  return mockGitHub ? { issues, contributions } : { issues: [], contributions: [] }
}
