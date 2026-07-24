import { useTranslation } from '@git-manager/i18n'
import {
  LayoutDashboard,
  GitPullRequest,
  Trophy,
  FolderOpen,
  Download,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  Archive,
  ArchiveRestore,
  TerminalSquare,
  Settings,
  Activity,
} from 'lucide-react'
import { createElement } from 'react'
import { toast } from '@git-manager/ui'
import {
  useRepoUIStore,
  DASHBOARD_TAB,
  PULL_REQUESTS_TAB,
  REWARDS_TAB,
} from '../../../stores/repoUI.store'
import { useActionToolbar } from '../../../hooks/useActionToolbar'
import { useOpenRepository } from '../../../hooks/useOpenRepository'
import type { Section } from '../../../app/settings/SettingsPage'
import type { PaletteCommand } from './types'

/** Settings sections exposed as palette commands, in nav order. Each has a `commandPalette.settings.<id>` label. */
const SETTINGS_SECTIONS: Section[] = [
  'general',
  'ui_customization',
  'ssh',
  'integrations',
  'local_ai',
  'external_tools',
  'notifications',
  'rewards',
]

interface UseGlobalCommandsParams {
  onOpenSettings: (section: Section) => void
  onOpenActivityLogs: () => void
}

/**
 * Always-available palette commands: tab navigation, open-repo, per-section settings, and — when a
 * repo is active — the main toolbar actions (reused from {@link useActionToolbar}, not reimplemented).
 */
export function useGlobalCommands({
  onOpenSettings,
  onOpenActivityLogs,
}: UseGlobalCommandsParams): PaletteCommand[] {
  const { t } = useTranslation('common')
  const { t: tGit } = useTranslation('git')
  const setActiveTab = useRepoUIStore((s) => s.setActiveTab)
  const setPrCreateOpen = useRepoUIStore((s) => s.setPrCreateOpen)
  const openRepository = useOpenRepository()
  const toolbar = useActionToolbar(tGit)

  const commands: PaletteCommand[] = [
    {
      id: 'nav-dashboard',
      group: 'navigation',
      title: t('commandPalette.nav.dashboard'),
      icon: createElement(LayoutDashboard),
      run: () => setActiveTab(DASHBOARD_TAB),
    },
    {
      id: 'nav-pull-requests',
      group: 'navigation',
      title: t('commandPalette.nav.pullRequests'),
      keywords: ['pr', 'pull request'],
      icon: createElement(GitPullRequest),
      run: () => setActiveTab(PULL_REQUESTS_TAB),
    },
    {
      id: 'nav-rewards',
      group: 'navigation',
      title: t('commandPalette.nav.rewards'),
      keywords: ['achievements', 'trophies'],
      icon: createElement(Trophy),
      run: () => setActiveTab(REWARDS_TAB),
    },
    {
      id: 'repo-open',
      group: 'navigation',
      title: t('commandPalette.nav.openRepo'),
      keywords: ['browse', 'folder'],
      icon: createElement(FolderOpen),
      run: () => {
        openRepository().catch((err) => toast.error(String(err)))
      },
    },
    {
      id: 'nav-activity-logs',
      group: 'navigation',
      title: t('activityLogs.commandPalette'),
      keywords: ['logs', 'activity', 'debug', 'ipc'],
      icon: createElement(Activity),
      run: () => onOpenActivityLogs(),
    },
  ]

  if (toolbar.activeRepo) {
    commands.push(
      {
        id: 'repo-create-pr',
        group: 'repo',
        title: t('commandPalette.repo.createPr'),
        keywords: ['pr', 'pull request', 'create pr', 'new pr', 'github'],
        icon: createElement(GitPullRequest),
        run: () => {
          setActiveTab(toolbar.activeRepo!)
          setPrCreateOpen(true)
        },
      },
      {
        id: 'repo-fetch',
        group: 'repo',
        title: t('commandPalette.repo.fetch'),
        icon: createElement(Download),
        run: () => void toolbar.handleFetch(),
      },
      {
        id: 'repo-fetch-all',
        group: 'repo',
        title: t('commandPalette.repo.fetchAll'),
        icon: createElement(RefreshCw),
        run: () => void toolbar.handleFetchAll(),
      },
      {
        id: 'repo-pull',
        group: 'repo',
        title: t('commandPalette.repo.pull'),
        icon: createElement(ArrowDownToLine),
        run: () => void toolbar.handlePull(),
      },
      {
        id: 'repo-push',
        group: 'repo',
        title: t('commandPalette.repo.push'),
        icon: createElement(ArrowUpFromLine),
        run: () => void toolbar.handlePush(),
      },
      {
        id: 'repo-stash',
        group: 'repo',
        title: t('commandPalette.repo.stash'),
        icon: createElement(Archive),
        run: () => void toolbar.handleStash(),
      }
    )
    if (toolbar.hasStashes) {
      commands.push({
        id: 'repo-pop',
        group: 'repo',
        title: t('commandPalette.repo.pop'),
        icon: createElement(ArchiveRestore),
        run: () => void toolbar.handlePop(),
      })
    }
    commands.push({
      id: 'repo-terminal',
      group: 'repo',
      title: t('commandPalette.repo.terminal'),
      keywords: ['shell', 'console'],
      icon: createElement(TerminalSquare),
      run: () => void toolbar.handleOpenTerminal(),
    })
  }

  for (const section of SETTINGS_SECTIONS) {
    commands.push({
      id: `settings-${section}`,
      group: 'settings',
      title: t(`commandPalette.settings.${section}`),
      icon: createElement(Settings),
      run: () => onOpenSettings(section),
    })
  }

  return commands
}
