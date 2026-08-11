import { useBoardStore } from '../../features/board/stores/board.store'
import { useDashboardStore } from '../../features/dashboard/stores/dashboard.store'
import { useGameStore } from '../../stores/game.store'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'
import { useLaunchpadStore } from '../../features/launchpad/stores/launchpad.store'
import { usePinnedBranchesStore } from '../../stores/pinned-branches.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useSettingsStore } from '../../stores/settings.store'
import { loadAppConfig } from './appConfigFile'
import { migrateSecretsOutOfSettings } from './secretsMigration'

/**
 * Loads the configuration file, then hydrates every store backed by it — the one thing `main.tsx`
 * awaits before the first render.
 *
 * The explicit list is the point. Each of these stores is created with `skipHydration`, because
 * reading the file is asynchronous and `zustand/persist` would otherwise have them start on their
 * defaults and swap a frame later: the app would paint in the wrong theme and language, with no
 * tabs, and only then become itself. Adding a store to `sections.ts` without adding it here would
 * reproduce exactly that, silently — so the two lists are meant to be read together.
 *
 * Rehydration itself is synchronous work over an object already in memory; the `await` is the file
 * read, once, for all nine.
 *
 * The secrets migration sits in the gap between the two on purpose: it needs the document loaded,
 * and it must finish before the settings store publishes a state — otherwise every consumer sees the
 * tokens for a frame and the cleaned settings arrive as a second render. See `secretsMigration.ts`.
 */
export async function hydrateConfigStores(): Promise<void> {
  await loadAppConfig()
  await migrateSecretsOutOfSettings()
  await Promise.all([
    useSettingsStore.persist.rehydrate(),
    useRepoDataStore.persist.rehydrate(),
    useRepoUIStore.persist.rehydrate(),
    useDashboardStore.persist.rehydrate(),
    usePinnedBranchesStore.persist.rehydrate(),
    useGitGraphColumnsStore.persist.rehydrate(),
    useBoardStore.persist.rehydrate(),
    useLaunchpadStore.persist.rehydrate(),
    useGameStore.persist.rehydrate(),
  ])
}
