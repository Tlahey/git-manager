import { z } from 'zod'
import { appSettingsSchema } from './settingsSchema'

/**
 * The sections of `~/.git-manager/settings.json`, and what each one is allowed to look like.
 *
 * One entry per persisted store that belongs in the *configuration*: what the user set up and what
 * they were working on. Deliberately absent, and staying in `localStorage`: the caches and journals
 * — AI answers, explanations, commit searches, notifications, undo/redo history. They are rebuildable
 * by definition, they are measured in megabytes, and a configuration file is not a log.
 *
 * `legacyKey` is where the same state lived before the file existed. The first launch that finds no
 * section in the file adopts it from there, once, so an existing install keeps its settings, its
 * open tabs and its trophies (see `appConfigFile.ts`); it is also the key each store falls back to
 * wholesale when the file is switched off (`GIT_MANAGER_NO_CONFIG`, used by the e2e suite).
 *
 * On strictness: the schemas below describe what the stores actually read back, not every field
 * they happen to write. Validation exists to catch a *malformed* file — a hand-edit typo, a
 * half-synced copy, a snapshot from a much older build — before it reaches code that assumes its
 * shape. A schema stricter than the store would turn a harmless unknown field into deleted user
 * data, so where a value is an open set (a theme name, an achievement definition) it is accepted as
 * given and left to the store's own merge.
 *
 * **No secret belongs in this file, and none is written to it.** Provider tokens and the AI API key
 * live in the OS keychain (`lib/tauri/credentials.ts`, `services/credential_store.rs`), reachable
 * only from Rust; what an account keeps here is its id, its login and its avatar. The schemas below
 * name no `token` and no `apiKey`, so adding one back would show up in a diff — and a settings file
 * written by an older build is repaired on the first launch that reads it (`secretsMigration.ts`
 * moves whatever it finds into the keychain and rewrites the section without it).
 *
 * The file is still written owner-only (`0600`, see `services/app_config.rs`). That is no longer
 * what stands between a token and a backup, but it costs nothing and the configuration remains the
 * user's own business.
 */

const columnStateSchema = z.object({ visible: z.boolean(), width: z.number() })

const savedFilterSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string(),
  type: z.enum(['prs', 'issues', 'both']),
  titleContains: z.string().optional(),
  authorContains: z.string().optional(),
  repo: z.string().optional(),
  labelContains: z.string().optional(),
  statuses: z.array(z.string()).optional(),
  needsMyReview: z.boolean().optional(),
  createdAt: z.number(),
})

/**
 * Only the three fields `game.store.ts`'s own merge reads back off a persisted achievement.
 *
 * The rest of an `Achievement` is its *definition* — points, tier, unlock rule — which the store
 * rebuilds from `INITIAL_ACHIEVEMENTS` on every rehydration precisely so a shipped definition can
 * change without rewriting anyone's save. Validating fields nobody reads would only create ways to
 * lose a trophy.
 */
const achievementSchema = z.object({
  id: z.string(),
  unlocked: z.boolean().optional(),
  unlockedAt: z.number().optional(),
})

export const SECTION_SCHEMAS = {
  /** Everything in Settings. Repaired per *group* rather than as a whole — see `validate.ts`. */
  settings: appSettingsSchema,

  /** The repositories the app knows about, and the per-repo bits of view state that outlive a tab. */
  repositories: z.object({
    savedRepos: z.array(z.object({ path: z.string(), name: z.string(), pinned: z.boolean() })),
    discoveredRepos: z.array(z.object({ path: z.string(), name: z.string() })),
    recentRepoPaths: z.array(z.string()),
    linkedWorktreePaths: z.array(z.string()),
    wipMessages: z.record(z.string(), z.string()),
    hiddenStashes: z.record(z.string(), z.array(z.string())),
    hiddenTags: z.record(z.string(), z.array(z.string())),
    hiddenBranches: z.record(z.string(), z.array(z.string())),
    // Optional: the first field added to this section after the config file already shipped.
    // A file written before it exists must still validate, or every other field in the section
    // (savedRepos included) would be reset the first time it's read back — see `validate.ts`,
    // which resets a section wholesale when it fails its schema, not field by field.
    hiddenFixups: z.record(z.string(), z.array(z.string())).optional(),
  }),

  /** What was open when the app was last closed: the tabs, and which one was in front. */
  workspace: z.object({
    openTabs: z.array(z.string()),
    activeRepo: z.string().nullable(),
    activeTab: z.string(),
  }),

  dashboard: z.object({
    collapsedSections: z.record(z.string(), z.boolean()),
    hiddenSections: z.record(z.string(), z.boolean()),
    sectionColors: z.record(z.string(), z.string()),
  }),

  pinnedBranches: z.object({
    overrides: z.record(z.string(), z.record(z.string(), z.boolean())),
  }),

  graphColumns: z.object({ columns: z.record(z.string(), columnStateSchema) }),

  board: z.object({
    activeBoardIdByRepo: z.record(z.string(), z.string()),
    collapsedCardSections: z.record(z.string(), z.boolean()),
  }),

  launchpad: z.object({
    savedFilters: z.array(savedFilterSchema),
    activeTab: z.string(),
    snoozed: z.record(z.string(), z.number().nullable()),
    connectBannerDismissed: z.boolean(),
  }),

  /** Rewards progression: unlocked trophies, XP and the counters behind them. */
  rewards: z.object({
    achievements: z.array(achievementSchema),
    points: z.number(),
    terminalHistorySnapshot: z.record(z.string(), z.array(z.string())).nullable(),
    rewardsEnabled: z.boolean(),
    commitCount: z.number(),
    prMergedCount: z.number(),
    terminalCommandCount: z.number(),
  }),
} as const satisfies Record<string, z.ZodType>

export type ConfigSection = keyof typeof SECTION_SCHEMAS

/** Where each section's state lived before the configuration file existed. */
export const SECTION_LEGACY_KEYS: Record<ConfigSection, string> = {
  settings: 'git-manager-settings',
  repositories: 'git-manager-repos',
  workspace: 'git-manager-repos-ui',
  dashboard: 'git-manager-dashboard',
  pinnedBranches: 'git-manager-pinned-branches',
  graphColumns: 'git-manager-git-graph-columns',
  board: 'git-manager-board',
  launchpad: 'git-manager-launchpad',
  rewards: 'git-manager-game-store',
}

export const CONFIG_SECTIONS = Object.keys(SECTION_SCHEMAS) as ConfigSection[]

/**
 * Reshapes a legacy `localStorage` snapshot into what its section looks like in the file.
 *
 * Only `settings` needs one: it used to be persisted as `{ settings: … }` (a store whose state has
 * one key), and the file drops that wrapper so the section reads as the settings themselves. Every
 * other store persists its slice flat, so its snapshot is already the section.
 */
export const SECTION_LEGACY_ADAPTERS: Partial<Record<ConfigSection, (state: unknown) => unknown>> =
  {
    settings: (state) => (state as { settings?: unknown })?.settings ?? state,
  }
