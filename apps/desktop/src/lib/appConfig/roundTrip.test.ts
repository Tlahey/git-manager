import { describe, it, expect } from 'vitest'
import { useBoardStore } from '../../features/board/stores/board.store'
import { useDashboardStore } from '../../stores/dashboard.store'
import { useGameStore } from '../../stores/game.store'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'
import { useLaunchpadStore } from '../../stores/launchpad.store'
import { usePinnedBranchesStore } from '../../stores/pinned-branches.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useSettingsStore } from '../../stores/settings.store'
import { CONFIG_SECTIONS, type ConfigSection } from './sections'
import { validateSection } from './validate'

/**
 * The one way this design can lose user data silently: a schema stricter than the store it
 * describes.
 *
 * Nothing complains at write time — the section lands in the file exactly as the store produced it.
 * It is the *next launch* that drops it, because validation says it doesn't match, and the store
 * comes up on its defaults. The user sees a reset they did nothing to cause, and the file they
 * would send you looks perfectly fine. Rewards is the sharp end of it: the trophies are the one
 * section nothing can rebuild.
 *
 * So: take what each store actually persists, put it through the JSON round trip the file imposes,
 * and require its own schema to accept it. `sections.ts` says the schemas describe what the stores
 * read back rather than every field they write — this is what keeps that claim honest.
 */

interface PersistedStore {
  getState: () => unknown
  persist: { getOptions: () => { partialize?: (state: never) => unknown } }
}

const STORE_BY_SECTION: Record<ConfigSection, PersistedStore> = {
  settings: useSettingsStore as unknown as PersistedStore,
  repositories: useRepoDataStore as unknown as PersistedStore,
  workspace: useRepoUIStore as unknown as PersistedStore,
  dashboard: useDashboardStore as unknown as PersistedStore,
  pinnedBranches: usePinnedBranchesStore as unknown as PersistedStore,
  graphColumns: useGitGraphColumnsStore as unknown as PersistedStore,
  board: useBoardStore as unknown as PersistedStore,
  launchpad: useLaunchpadStore as unknown as PersistedStore,
  rewards: useGameStore as unknown as PersistedStore,
}

/** Exactly what reaches the file: the store's partialized state, serialized and read back — which
 * is where `undefined` fields and functions silently disappear. */
function whatTheStoreWrites(store: PersistedStore): unknown {
  const partialize = store.persist.getOptions().partialize
  const payload = partialize ? partialize(store.getState() as never) : store.getState()
  return JSON.parse(JSON.stringify(payload))
}

describe('every section survives a write/read round trip through its own schema', () => {
  it.each(CONFIG_SECTIONS)('%s', (section) => {
    const written = whatTheStoreWrites(STORE_BY_SECTION[section])
    const { value, problems } = validateSection(section, written)

    expect(problems, `"${section}" writes something its own schema rejects`).toEqual([])
    expect(value, `"${section}" would be dropped on the next launch`).not.toBeUndefined()
  })

  it('keeps a settings group the store filled in, rather than silently emptying it', () => {
    // A validation that returned `{}` for everything would pass the assertions above without
    // preserving anything, so pin one group that is definitely populated at rest.
    const written = whatTheStoreWrites(STORE_BY_SECTION.settings) as { ai?: { model?: string } }
    const { value } = validateSection('settings', written)
    expect((value as { ai: { model: string } }).ai.model).toBe(written.ai?.model)
  })

  it('keeps an unlocked trophy through the round trip', () => {
    // The section nothing can rebuild: a dropped `rewards` is progression the user cannot get back
    // by re-doing anything.
    const state = useGameStore.getState()
    useGameStore.setState({
      achievements: state.achievements.map((a, i) =>
        i === 0 ? { ...a, unlocked: true, unlockedAt: 1_700_000_000_000 } : a
      ),
      points: 42,
    })

    const written = whatTheStoreWrites(STORE_BY_SECTION.rewards)
    const { value, problems } = validateSection('rewards', written)

    expect(problems).toEqual([])
    const rewards = value as { points: number; achievements: { unlocked?: boolean }[] }
    expect(rewards.points).toBe(42)
    expect(rewards.achievements[0].unlocked).toBe(true)

    useGameStore.setState({ achievements: state.achievements, points: state.points })
  })
})
