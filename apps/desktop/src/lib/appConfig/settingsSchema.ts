import { z } from 'zod'
import type { AiPresetId } from '@git-manager/ai'
import type { AppSettings, NotificationDisplayStyle } from '@git-manager/git-types'

/**
 * Zod schema for the `settings` section of `~/.git-manager/settings.json`, one schema per group.
 *
 * **What it is for.** The configuration is a file a user can open, hand-edit, sync between machines
 * and carry across version bumps. Validating it on the way in is what stops a hand-edit typo, a
 * half-synced file or a snapshot from a much older build from reaching code that assumes its shape
 * — a `fontSize` of `"14"` rather than `14` used to be found by a component, at render, in a stack
 * trace naming neither the file nor the field.
 *
 * **Per group, not per file.** {@link SETTINGS_GROUP_SCHEMAS} is keyed the way the settings are, so
 * one bad group falls back to its defaults and the other twelve survive — `mergeSettingsWithDefaults`
 * in `settings.store.ts` already fills an absent group, so dropping one is exactly "reset that
 * group". Validating the whole object at once would make a single mistyped field cost every setting
 * the user has.
 *
 * **It accepts more than it describes.** These are plain `z.object`s, which *tolerate* unknown keys
 * (only `.strict()` rejects them) — and the validated value is thrown away: the caller keeps the raw
 * one. A field a newer version added, or an old one this version stopped reading, therefore survives
 * a round trip through an older build instead of being quietly deleted. A schema that is stricter
 * than the store is not caution, it is data loss.
 */

/**
 * Two fields deliberately accept any string rather than their union, because the store's own
 * rehydration is what narrows them and rejecting here would throw the whole group away first:
 * `preset` is remapped by `migrateAiPresetId` (the per-vendor presets folded into
 * `openai-compatible`), and `theme` is an open set — a user theme dropped in `~/.git-manager/themes/`
 * is a valid value this file can't enumerate.
 */
const looseString = <T extends string>() => z.custom<T>((value) => typeof value === 'string')

const aiSchema = z.object({
  preset: looseString<AiPresetId>(),
  url: z.string(),
  model: z.string(),
  timeoutSeconds: z.number(),
  contextTokens: z.number().optional(),
  fastModel: z.string().optional(),
  concurrency: z.number().optional(),
  extraBody: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
})

const gitSchema = z.object({
  defaultAuthorName: z.string(),
  defaultAuthorEmail: z.string(),
  showStashesInGraph: z.boolean().optional(),
  initialGraphCommits: z.number().optional(),
  lazyLoadGraphCommits: z.boolean().optional(),
  externalEditorCommand: z.string(),
  commitInstructions: z.string().optional(),
  commitPattern: z.string().optional(),
  autoPrune: z.boolean().optional(),
  autoFetchIntervalMinutes: z.number().optional(),
})

const appearanceSchema = z.object({
  theme: z.string(),
  fontSize: z.number(),
  density: z.enum(['compact', 'normal', 'comfortable']),
  showAvatars: z.boolean(),
  enableAnimations: z.boolean(),
  notificationLocation: z.enum(['top-right', 'top-left', 'bottom-right', 'bottom-left']).optional(),
  rowHeight: z.enum(['standard', 'small']).optional(),
  stickyScroll: z.boolean().optional(),
  terminalBackground: z.string(),
  terminalForeground: z.string(),
  glassTransparency: z.number().optional(),
})

const advancedSchema = z.object({
  scanExclusions: z.array(z.string()),
  maxScanDepth: z.number(),
})

const githubUserSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  avatarUrl: z.string(),
})

// No `token` on an account, in either schema below, and no `apiKey` on `ai`: every secret lives in
// the OS keychain now (see `lib/tauri/credentials.ts`). A file written by an older build still
// carries them — `validate.ts` keeps the *raw* value, so nothing is stripped here — and
// `secretsMigration.ts` moves them across on the first launch that finds them.
const githubSchema = z.object({
  accounts: z.array(z.object({ id: z.string(), user: githubUserSchema })),
  activeAccountId: z.string().nullable(),
})

const sshSchema = z.object({
  privateKeyPath: z.string(),
  publicKeyPath: z.string(),
  useSystemAgent: z.boolean(),
})

const externalToolsSchema = z.object({
  externalTerminalCommand: z.string(),
  agentLaunchCommand: z.string().optional(),
})

const notificationsSchema = z.object({
  enabled: z.boolean(),
  notifyOnFetch: z.boolean(),
  notifyOnPull: z.boolean(),
  notifyOnPush: z.boolean(),
  enableSound: z.boolean(),
  soundName: z.string().optional(),
  notifyOnPrMerged: z.boolean().optional(),
  notifyOnPrQueued: z.boolean().optional(),
  notifyOnReviewRequested: z.boolean().optional(),
  notifyOnReviewStatusChanged: z.boolean().optional(),
  notifyOnNewPr: z.boolean().optional(),
  notifyOnCi: z.boolean().optional(),
  notifyOnTerminalFinished: z.boolean().optional(),
  // Any string: `migrateDisplayStyle` remaps the previous `'popover'` spelling on the way in.
  displayStyle: looseString<NotificationDisplayStyle>().optional(),
  displayDurationMs: z.number().optional(),
})

const providerAccountSchema = z.object({
  id: z.string(),
  host: z.string(),
  username: z.string(),
  avatarUrl: z.string().optional(),
  displayName: z.string().optional(),
  authMethod: z.enum(['oauth', 'token']).optional(),
  clientId: z.string().optional(),
})

const integrationsSchema = z.object({
  gitlabAccounts: z.array(providerAccountSchema),
  gitlabActiveAccountId: z.string().nullable(),
  bitbucketAccounts: z.array(providerAccountSchema),
  bitbucketActiveAccountId: z.string().nullable(),
})

const dailySummarySchema = z.object({
  enabled: z.boolean(),
  autoGenerate: z.boolean(),
  saveToRepo: z.boolean().optional(),
})

const boardSchema = z.object({
  autoSync: z.object({ enabled: z.boolean(), intervalMinutes: z.number() }),
})

const runTaskSchema = z.object({ id: z.string(), name: z.string(), command: z.string() })

const repoScopedSchema = z.object({
  protectedBranches: z.array(z.string()).optional(),
  defaultBranchName: z.string().optional(),
  targetBranches: z.array(z.string()).optional(),
  commitInstructions: z.string().optional(),
  commitPattern: z.string().optional(),
  theme: z.string().optional(),
  terminalBackground: z.string().optional(),
  terminalForeground: z.string().optional(),
  worktreeDefaultFiles: z.array(z.string()).optional(),
  runTasks: z.array(runTaskSchema).optional(),
  defaultRunTaskId: z.string().optional(),
})

/** One schema per settings group — the unit a repair works on. */
export const SETTINGS_GROUP_SCHEMAS = {
  ai: aiSchema,
  git: gitSchema,
  appearance: appearanceSchema,
  language: z.enum(['fr', 'en', 'es']),
  advanced: advancedSchema,
  // Optional exactly where `AppSettings` says so — these groups postdate the first version of the
  // settings and an old snapshot legitimately has none of them.
  github: githubSchema.optional(),
  ssh: sshSchema.optional(),
  externalTools: externalToolsSchema.optional(),
  notifications: notificationsSchema.optional(),
  integrations: integrationsSchema.optional(),
  dailySummary: dailySummarySchema.optional(),
  board: boardSchema.optional(),
  repoOverrides: z.record(z.string(), repoScopedSchema),
} satisfies Record<keyof AppSettings, z.ZodType>

export const appSettingsSchema = z.object(SETTINGS_GROUP_SCHEMAS)

/**
 * Compile-time proof that the schema and {@link AppSettings} still describe the same thing, in both
 * directions: a field added to the type with no schema entry fails the first assignment, and a
 * schema entry that drifted from the type fails the second. Nothing runs — the point is that a new
 * setting can't be added without this file being updated (and `pnpm typecheck` saying so).
 */
type SchemaSettings = z.infer<typeof appSettingsSchema>
const _schemaMatchesType: AppSettings = {} as SchemaSettings
const _typeMatchesSchema: SchemaSettings = {} as AppSettings
void _schemaMatchesType
void _typeMatchesSchema
