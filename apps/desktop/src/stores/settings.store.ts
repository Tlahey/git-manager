import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings } from '@git-manager/git-types'

const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    preset: 'ollama',
    url: 'http://localhost:11434',
    model: 'llama3.2',
    temperature: 0.3,
    timeoutSeconds: 30,
    systemPrompt: '',
    includeRepoContext: true,
    autoDetectScope: true,
  },
  git: {
    defaultAuthorName: '',
    defaultAuthorEmail: '',
    protectedBranches: ['main', 'master', 'develop'],
    showStashesInGraph: true,
    externalEditor: 'vscode',
    externalEditorCommand: '',
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
    mergeTool: 'integrated',
    mergeToolCommand: '',
    diffTool: 'integrated',
    diffToolCommand: '',
    externalTerminal: 'system',
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
}

interface SettingsState {
  settings: AppSettings
  updateSettings: (partial: Partial<AppSettings>) => void
  resetSettings: () => void
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
  const merged = { ...DEFAULT_SETTINGS, ...(persisted ?? {}) }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const def = DEFAULT_SETTINGS[key]
    const stored = persisted?.[key]
    if (def && typeof def === 'object' && !Array.isArray(def)) {
      ;(merged as Record<string, unknown>)[key] = {
        ...(def as unknown as Record<string, unknown>),
        ...((stored as unknown as Record<string, unknown> | undefined) ?? {}),
      }
    }
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
