import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings, RepoScopedSettings } from '@git-manager/git-types'

const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    preset: 'ollama',
    url: 'http://localhost:11434',
    model: 'llama3.2',
    timeoutSeconds: 30,
    enabled: true,
  },
  git: {
    defaultAuthorName: '',
    defaultAuthorEmail: '',
    showStashesInGraph: true,
    initialGraphCommits: 2000,
    lazyLoadGraphCommits: true,
    externalEditorCommand: '',
    commitInstructions: '',
    commitPattern: '',
    autoPrune: true,
    autoFetchIntervalMinutes: 1,
  },
  appearance: {
    theme: 'dark',
    fontSize: 14,
    density: 'normal',
    showAvatars: true,
    enableAnimations: true,
    notificationLocation: 'top-right',
    rowHeight: 'standard',
    stickyScroll: false,
  },
  language: 'fr',
  advanced: {
    scanExclusions: ['node_modules', '.pnpm-store', 'dist', 'build', 'target'],
    maxScanDepth: 3,
  },
  github: {
    accounts: [],
    activeAccountId: null,
  },
  ssh: {
    privateKeyPath: '~/.ssh/id_ed25519',
    publicKeyPath: '~/.ssh/id_ed25519.pub',
    useSystemAgent: true,
  },
  externalTools: {
    externalTerminalCommand: '',
  },
  notifications: {
    enabled: true,
    notifyOnFetch: true,
    notifyOnPull: true,
    notifyOnPush: true,
    enableSound: false,
    soundName: 'default',
    notifyOnPrMerged: true,
    notifyOnReviewRequested: true,
    notifyOnReviewStatusChanged: true,
    notifyOnNewPr: true,
  },
  integrations: {
    gitlabAccounts: [],
    gitlabActiveAccountId: null,
    bitbucketAccounts: [],
    bitbucketActiveAccountId: null,
  },
  dailySummary: {
    enabled: true,
    autoGenerate: true,
  },
  repoOverrides: {},
}

interface SettingsState {
  settings: AppSettings
  updateSettings: (partial: Partial<AppSettings>) => void
  resetSettings: () => void
  /** Resets only the given top-level settings groups (e.g. `['ai']`, `['git','advanced']`) back to
   * their defaults — the per-page "reset to default" affordance. Other groups are left untouched. */
  resetSettingsGroups: (groups: (keyof AppSettings)[]) => void
  /** Resets specific fields within one group back to their defaults, for pages that only expose part
   * of a group (e.g. the General and AI-commit pages both draw from `git`). */
  resetSettingsFields: <G extends keyof AppSettings>(
    group: G,
    fields: (keyof NonNullable<AppSettings[G]>)[]
  ) => void
  /** Sets a single per-repository override field. Pass the resolved/desired value; use
   * `resetRepoSetting` (not `undefined` here) to go back to inheriting the global value. */
  setRepoSetting: <K extends keyof RepoScopedSettings>(
    repoPath: string,
    key: K,
    value: RepoScopedSettings[K]
  ) => void
  /** Removes a single override field so the repo inherits the global value again. Drops the repo's
   * entry entirely once it has no remaining overrides, keeping `repoOverrides` free of empty shells. */
  resetRepoSetting: (repoPath: string, key: keyof RepoScopedSettings) => void
}

/**
 * Rehydration merge: fill anything missing from the persisted snapshot with
 * the defaults, group by group. zustand/persist's default merge is a shallow
 * top-level spread, so a stored `settings` object would otherwise *replace*
 * DEFAULT_SETTINGS wholesale — adding a new settings group (or seeding a
 * partial snapshot, as the e2e screenshot scenarios do) would then leave
 * every other group undefined and crash their consumers.
 */
export function mergeSettingsWithDefaults(persisted: Partial<AppSettings> | undefined): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...persisted }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const def = DEFAULT_SETTINGS[key]
    const stored = persisted?.[key]
    if (def && typeof def === 'object' && !Array.isArray(def)) {
      ;(merged as Record<string, unknown>)[key] = {
        ...(def as unknown as Record<string, unknown>),
        ...(stored as unknown as Record<string, unknown> | undefined),
      }
    }
  }
  // Legacy theme-id migration: the "obsidian" theme was renamed to "twilight"
  // (it's a light theme with dark chrome, so "obsidian" read as misleading). Remap
  // a persisted selection so existing users don't silently fall back to the default.
  if (merged.appearance?.theme === 'obsidian') {
    merged.appearance = { ...merged.appearance, theme: 'twilight' }
  }
  return merged
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,

      updateSettings: (partial) =>
        set((state) => ({
          settings: { ...state.settings, ...partial },
        })),

      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

      resetSettingsGroups: (groups) =>
        set((state) => {
          const next = { ...state.settings }
          for (const group of groups) {
            ;(next as Record<string, unknown>)[group] = DEFAULT_SETTINGS[group]
          }
          return { settings: next }
        }),

      resetSettingsFields: (group, fields) =>
        set((state) => {
          const current = state.settings[group] as Record<string, unknown>
          const defaults = DEFAULT_SETTINGS[group] as Record<string, unknown>
          const nextGroup = { ...current }
          for (const field of fields) {
            nextGroup[field as string] = defaults[field as string]
          }
          return { settings: { ...state.settings, [group]: nextGroup } }
        }),

      setRepoSetting: (repoPath, key, value) =>
        set((state) => {
          const existing = state.settings.repoOverrides[repoPath]
          return {
            settings: {
              ...state.settings,
              repoOverrides: {
                ...state.settings.repoOverrides,
                [repoPath]: { ...existing, [key]: value },
              },
            },
          }
        }),

      resetRepoSetting: (repoPath, key) =>
        set((state) => {
          const existing = state.settings.repoOverrides[repoPath]
          if (!existing || !(key in existing)) return state
          // Drop the field; if nothing is left, drop the whole repo entry too.
          const nextEntry: RepoScopedSettings = { ...existing }
          delete nextEntry[key]
          const nextOverrides = { ...state.settings.repoOverrides }
          if (Object.keys(nextEntry).length === 0) {
            delete nextOverrides[repoPath]
          } else {
            nextOverrides[repoPath] = nextEntry
          }
          return {
            settings: { ...state.settings, repoOverrides: nextOverrides },
          }
        }),
    }),
    {
      name: 'git-manager-settings',
      merge: (persisted, current) => ({
        ...current,
        settings: mergeSettingsWithDefaults(
          (persisted as { settings?: Partial<AppSettings> } | undefined)?.settings
        ),
      }),
    }
  )
)
