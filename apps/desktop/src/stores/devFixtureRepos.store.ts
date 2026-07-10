import { create } from 'zustand'

export interface DevFixtureRepo {
  name: string
  path: string
  description: string
}

interface DevFixtureReposState {
  fixtures: DevFixtureRepo[]
  setFixtures: (fixtures: DevFixtureRepo[]) => void
  removeFixture: (path: string) => void
}

/**
 * Repos injected by `pnpm dev:import-repo` (see useDevFixtureImport.ts). Intentionally NOT
 * wrapped in zustand/persist, unlike repoUI.store and repoData.store — these tabs must never
 * leak into localStorage, or a plain `pnpm dev` would start showing them too. See
 * tools/git-fixtures/README.md for the full mechanism.
 */
export const useDevFixtureReposStore = create<DevFixtureReposState>()((set) => ({
  fixtures: [],
  setFixtures: (fixtures) => set({ fixtures }),
  removeFixture: (path) =>
    set((state) => ({ fixtures: state.fixtures.filter((f) => f.path !== path) })),
}))
