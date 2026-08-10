import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AppConfigLoad } from '../tauri'

const readConfig = vi.fn<() => Promise<AppConfigLoad>>()

vi.mock('../../api/config.api', () => ({
  apiReadAppConfig: () => readConfig(),
  apiWriteAppConfigSection: vi.fn(() => Promise.resolve()),
}))

import { useBoardStore } from '../../features/board/stores/board.store'
import { useDashboardStore } from '../../stores/dashboard.store'
import { useGameStore } from '../../stores/game.store'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'
import { useLaunchpadStore } from '../../features/launchpad/stores/launchpad.store'
import { usePinnedBranchesStore } from '../../stores/pinned-branches.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useSettingsStore } from '../../stores/settings.store'
import { resetAppConfigForTests } from './appConfigFile'
import { hydrateConfigStores } from './hydrate'
import { CONFIG_SECTIONS } from './sections'

/**
 * One distinctive, non-default value per section, and the store that must come back holding it.
 *
 * This is the test for a list that can silently rot: `sections.ts` says what lives in the file and
 * `hydrate.ts` says which stores read it, and a section added to the first without the second looks
 * completely fine — the file gains a key, and the store it belongs to quietly starts every launch
 * on its defaults. Keying the table off `CONFIG_SECTIONS` means adding a section without hydrating
 * it fails here rather than in a bug report about lost state.
 */
const SECTIONS: Record<(typeof CONFIG_SECTIONS)[number], { state: unknown; check: () => unknown }> =
  {
    settings: {
      state: { language: 'en' },
      check: () => useSettingsStore.getState().settings.language,
    },
    repositories: {
      state: {
        savedRepos: [{ path: '/repo', name: 'repo', pinned: false }],
        discoveredRepos: [],
        recentRepoPaths: [],
        linkedWorktreePaths: [],
        wipMessages: {},
        hiddenStashes: {},
        hiddenTags: {},
        hiddenBranches: {},
      },
      check: () => useRepoDataStore.getState().savedRepos.map((r) => r.path),
    },
    workspace: {
      state: { openTabs: ['/repo'], activeRepo: '/repo', activeTab: '/repo' },
      check: () => useRepoUIStore.getState().openTabs,
    },
    dashboard: {
      state: { collapsedSections: { open: true }, hiddenSections: {}, sectionColors: {} },
      check: () => useDashboardStore.getState().collapsedSections,
    },
    pinnedBranches: {
      state: { overrides: { '/repo': { main: true } } },
      check: () => usePinnedBranchesStore.getState().overrides,
    },
    graphColumns: {
      state: { columns: { sha: { visible: false, width: 120 } } },
      check: () => useGitGraphColumnsStore.getState().columns.sha.width,
    },
    board: {
      state: {
        activeBoardIdByRepo: { '/repo': 'board-1' },
        collapsedCardSections: {},
      },
      check: () => useBoardStore.getState().activeBoardIdByRepo,
    },
    launchpad: {
      state: {
        savedFilters: [],
        activeTab: 'issues',
        snoozed: {},
        connectBannerDismissed: true,
      },
      check: () => useLaunchpadStore.getState().connectBannerDismissed,
    },
    rewards: {
      state: {
        achievements: [],
        points: 250,
        terminalHistorySnapshot: null,
        rewardsEnabled: false,
        commitCount: 7,
        prMergedCount: 0,
        terminalCommandCount: 0,
      },
      check: () => useGameStore.getState().points,
    },
  }

const EXPECTED = {
  settings: 'en',
  repositories: ['/repo'],
  workspace: ['/repo'],
  dashboard: { open: true },
  pinnedBranches: { '/repo': { main: true } },
  graphColumns: 120,
  board: { '/repo': 'board-1' },
  launchpad: true,
  rewards: 250,
} as const

/**
 * Puts a store's factory state back.
 *
 * Every store here is a module singleton, so without this one test's hydration is the next one's
 * starting point. Generic (rather than one array of nine differently-typed stores) so `setState`
 * still type-checks against each store's own state.
 */
function resetter<T extends object>(store: {
  getState: () => T
  setState: (state: T, replace: true) => void
}): () => void {
  const initial = { ...store.getState() }
  return () => store.setState(initial, true)
}

const RESET_STORES = [
  resetter(useSettingsStore),
  resetter(useRepoDataStore),
  resetter(useRepoUIStore),
  resetter(useDashboardStore),
  resetter(usePinnedBranchesStore),
  resetter(useGitGraphColumnsStore),
  resetter(useBoardStore),
  resetter(useLaunchpadStore),
  resetter(useGameStore),
]

beforeEach(() => {
  RESET_STORES.forEach((reset) => reset())
  resetAppConfigForTests()
  localStorage.clear()
  const file = Object.fromEntries(
    Object.entries(SECTIONS).map(([section, { state }]) => [section, state])
  )
  readConfig.mockReset().mockResolvedValue({
    disabled: false,
    contents: JSON.stringify({ ...file, versions: { settings: 1 } }),
  })
})

afterEach(() => resetAppConfigForTests())

describe('hydrateConfigStores', () => {
  it('covers every section the configuration file declares', () => {
    expect(Object.keys(SECTIONS).sort()).toEqual([...CONFIG_SECTIONS].sort())
  })

  it('hydrates every store from its section, in one read of the file', async () => {
    await hydrateConfigStores()

    for (const section of CONFIG_SECTIONS) {
      expect(SECTIONS[section].check(), `"${section}" did not reach its store`).toEqual(
        EXPECTED[section]
      )
    }
    expect(readConfig).toHaveBeenCalledTimes(1)
  })

  it('leaves the stores on their defaults when the file is switched off', async () => {
    // GIT_MANAGER_NO_CONFIG with nothing in localStorage: a fresh app, not a broken one.
    readConfig.mockResolvedValue({ disabled: true, contents: null })
    await hydrateConfigStores()

    expect(useSettingsStore.getState().settings.language).toBe('fr')
    expect(useRepoUIStore.getState().openTabs).toEqual([])
  })
})
