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
  GraduationCap,
} from 'lucide-react'
import { createElement } from 'react'
import { toast } from '@git-manager/ui'
import {
  useRepoUIStore,
  DASHBOARD_TAB,
  PULL_REQUESTS_TAB,
  REWARDS_TAB,
} from '../../../stores/repoUI.store'
import { goToRepoContent, useRepoViewStore } from '../../../stores/repoView.store'
import { useActionToolbar } from '../../../hooks/useActionToolbar'
import { useOpenRepository } from '../../../hooks/useOpenRepository'
import { openActionJournalWindow } from '../../../lib/actionJournalWindow'
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
    {
      id: 'nav-action-journal',
      group: 'navigation',
      title: t('actionJournal.commandPalette'),
      keywords: ['git', 'learn', 'commands', 'explain', 'behind', 'teach'],
      icon: createElement(GraduationCap),
      run: () => void openActionJournalWindow(),
    },
  ]

  if (toolbar.activeRepo) {
    // The palette is the one surface that offers these from anywhere. The toolbar's own copies live
    // on the graph (`GraphToolbarActions`), so they are already where their result shows; run from
    // the board or the files view, every one of them would otherwise change something off screen —
    // a fetch that moves a graph nobody is looking at, a PR composer opened behind a Kanban. Landing
    // on the content view first is what makes the command's effect the thing you then see.
    const onContent = (run: () => void) => () => {
      goToRepoContent()
      run()
    }
    commands.push(
      {
        id: 'repo-create-pr',
        group: 'repo',
        title: t('commandPalette.repo.createPr'),
        keywords: ['pr', 'pull request', 'create pr', 'new pr', 'github'],
        icon: createElement(GitPullRequest),
        run: onContent(() => {
          setActiveTab(toolbar.activeRepo!)
          setPrCreateOpen(true)
        }),
      },
      {
        id: 'repo-fetch',
        group: 'repo',
        title: t('commandPalette.repo.fetch'),
        icon: createElement(Download),
        run: onContent(() => void toolbar.handleFetch()),
      },
      {
        id: 'repo-fetch-all',
        group: 'repo',
        title: t('commandPalette.repo.fetchAll'),
        icon: createElement(RefreshCw),
        run: onContent(() => void toolbar.handleFetchAll()),
      },
      {
        id: 'repo-pull',
        group: 'repo',
        title: t('commandPalette.repo.pull'),
        icon: createElement(ArrowDownToLine),
        run: onContent(() => void toolbar.handlePull()),
      },
      {
        id: 'repo-push',
        group: 'repo',
        title: t('commandPalette.repo.push'),
        icon: createElement(ArrowUpFromLine),
        run: onContent(() => void toolbar.handlePush()),
      },
      {
        id: 'repo-stash',
        group: 'repo',
        title: t('commandPalette.repo.stash'),
        icon: createElement(Archive),
        run: onContent(() => void toolbar.handleStash()),
      }
    )
    if (toolbar.hasStashes) {
      commands.push({
        id: 'repo-pop',
        group: 'repo',
        title: t('commandPalette.repo.pop'),
        icon: createElement(ArchiveRestore),
        run: onContent(() => void toolbar.handlePop()),
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
    commands.push({
      id: 'repo-files',
      group: 'repo',
      title: t('commandPalette.repo.files'),
      keywords: ['files', 'tree', 'explorer'],
      icon: createElement(FolderOpen),
      run: () => {
        setActiveTab(toolbar.activeRepo!)
        useRepoViewStore.getState().setView('files')
      },
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
