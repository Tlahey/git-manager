import { useEffect } from 'react'
import { useDevFixtureReposStore, type DevFixtureRepo } from '../stores/devFixtureRepos.store'

/**
 * Dev-only: when the app is launched via `pnpm dev:import-repo`, VITE_DEV_FIXTURES carries a
 * JSON array of test-fixture repos (rebuilt fresh by tools/git-fixtures/) that gets injected as
 * extra tab-bar entries — additive to whatever's already open, never written to localStorage. A
 * plain `pnpm dev` never sets this env var, so normal sessions are unaffected.
 */
export function useDevFixtureImport() {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const raw = import.meta.env.VITE_DEV_FIXTURES as string | undefined
    if (!raw) return
    try {
      const fixtures = JSON.parse(raw) as DevFixtureRepo[]
      useDevFixtureReposStore.getState().setFixtures(fixtures)
    } catch (err) {
      console.error('[dev-fixtures] failed to parse VITE_DEV_FIXTURES', err)
    }
  }, [])
}
