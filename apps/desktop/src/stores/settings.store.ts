import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings } from '@git-manager/git-types'

const DEFAULT_SETTINGS: AppSettings = {
  ollama: {
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
    autoFetchIntervalMinutes: null,
    showRemoteBranches: true,
    confirmBeforeForcePush: true,
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
    externalEditor: 'vscode',
    externalEditorCommand: '',
    externalTerminal: 'system',
    externalTerminalCommand: '',
  },
  notifications: {
    enabled: true,
    notifyOnFetch: true,
    notifyOnPull: true,
    notifyOnPush: true,
    enableSound: false,
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
    { name: 'git-manager-settings' }
  )
)
