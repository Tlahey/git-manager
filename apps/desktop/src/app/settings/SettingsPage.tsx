import { useState, type ComponentType } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, ScrollArea } from '@git-manager/ui'
import {
  ArrowLeft,
  Bell,
  Bug,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  Heart,
  KeyRound,
  Palette,
  Play,
  Puzzle,
  ScrollText,
  Settings2,
  Sparkles,
  Trophy,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { GeneralSection } from './components/GeneralSection'
import { RepositorySection } from './components/RepositorySection'
import { AiCommitSection } from './components/AiCommitSection'
import { SshSection } from './components/SshSection'
import { IntegrationSection } from './components/IntegrationSection'
import { AiSection } from './components/AiSection'
import { ExternalToolsSection } from './components/ExternalToolsSection'
import { NotificationSection } from './components/NotificationSection'
import { AppearanceSection } from './components/AppearanceSection'
import { RewardsSection } from './components/RewardsSection'
import { DebugSection } from './components/DebugSection'
import { ChangelogSection } from './components/ChangelogSection'
import { SupportSection } from './components/SupportSection'
import { ResetToDefaultButton } from './components/ResetToDefaultButton'
import { defineTabs, renderActiveTab, type TabDef } from '../../lib/navigation/tabRegistry'
import { useSettingsStore } from '../../stores/settings.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useCanonicalRepoPath } from '../../hooks/useCanonicalRepoPath'

export type Section =
  | 'general'
  | 'ssh'
  | 'integrations'
  | 'local_ai'
  | 'ai_commit'
  | 'external_tools'
  | 'notifications'
  | 'ui_customization'
  | 'rewards'
  | 'debug'
  | 'changelog'
  | 'support'

/** Top-level split: global settings (all repos) vs. settings local to the current workspace/repo. */
type Scope = 'general' | 'local'

/** The Repository scope's own side-menu pages. `gitflow`, `worktree` and `run` are repo-only (no
 * global counterpart); `appearance` and `ai_commit` mirror the matching global sections. */
type LocalSection = 'gitflow' | 'appearance' | 'ai_commit' | 'worktree' | 'run'

interface SettingsPageProps {
  onClose: () => void
  initialSection?: Section
}

const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac')

/** Scrollable, centered layout shared by every section except `integrations` (full-bleed). */
function scrolled(node: React.ReactNode) {
  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto max-w-xl px-8 py-6">{node}</div>
    </ScrollArea>
  )
}

/** Prepends a right-aligned per-page "reset to default" button above a section's content. */
function withReset(node: React.ReactNode, onReset: () => void) {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <ResetToDefaultButton onReset={onReset} />
      </div>
      {node}
    </>
  )
}

/** One side-panel nav entry (icon + label), shared by the Global, Repository, and pinned Support
 * groups so they stay visually identical. */
function NavItem({
  testId,
  icon: Icon,
  label,
  active,
  onClick,
  iconClassName,
}: {
  testId: string
  icon?: ComponentType<{ className?: string }>
  label: string
  active: boolean
  onClick: () => void
  iconClassName?: string
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2 rounded py-2 pl-5 pr-3 text-left text-xs transition-colors ${
        active
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`}
    >
      {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClassName ?? ''}`} />}
      {label}
    </button>
  )
}

export function SettingsPage({ onClose, initialSection }: SettingsPageProps) {
  const { t } = useTranslation('settings')
  const [scope, setScope] = useState<Scope>('general')
  const [activeSection, setActiveSection] = useState<Section>(initialSection || 'general')
  const [activeLocal, setActiveLocal] = useState<LocalSection>('gitflow')
  const resetSettingsGroups = useSettingsStore((s) => s.resetSettingsGroups)
  const resetSettingsFields = useSettingsStore((s) => s.resetSettingsFields)
  const resetRepoSetting = useSettingsStore((s) => s.resetRepoSetting)
  // The active tab may be a linked worktree; the Local scope always targets the owning repo so a
  // worktree shows and edits its repo's configuration, not its own.
  const activeRepo = useCanonicalRepoPath(useRepoUIStore((s) => s.activeRepo))
  // AI-scoped pages (the AI-commit section) only show when AI is enabled. `undefined` = enabled.
  const aiEnabled = useSettingsStore((s) => s.settings.ai.enabled !== false)

  /** Clears the active repo's overrides for the given Repository page. */
  function resetLocalCategory(cat: LocalSection) {
    if (!activeRepo) return
    if (cat === 'appearance') {
      resetRepoSetting(activeRepo, 'theme')
    } else if (cat === 'ai_commit') {
      resetRepoSetting(activeRepo, 'commitInstructions')
      resetRepoSetting(activeRepo, 'commitPattern')
    } else if (cat === 'worktree') {
      resetRepoSetting(activeRepo, 'worktreeDefaultFiles')
    } else if (cat === 'run') {
      resetRepoSetting(activeRepo, 'runTasks')
      resetRepoSetting(activeRepo, 'defaultRunTaskId')
    } else {
      resetRepoSetting(activeRepo, 'protectedBranches')
      resetRepoSetting(activeRepo, 'defaultBranchName')
    }
  }

  const SETTINGS_TABS: TabDef<Section>[] = defineTabs([
    {
      id: 'general',
      icon: Settings2,
      // Commit style lives on its own AI-commit page, so General resets only its own fields.
      render: () =>
        scrolled(
          withReset(<GeneralSection />, () => {
            resetSettingsFields('git', [
              'defaultAuthorName',
              'defaultAuthorEmail',
              'initialGraphCommits',
              'lazyLoadGraphCommits',
              'autoPrune',
              'autoFetchIntervalMinutes',
            ])
            resetSettingsGroups(['advanced'])
          })
        ),
      label: t('settings.sections.general'),
    },
    {
      id: 'ssh',
      icon: KeyRound,
      label: t('settings.sections.ssh'),
      render: () => scrolled(withReset(<SshSection />, () => resetSettingsGroups(['ssh']))),
    },
    {
      id: 'integrations',
      icon: Puzzle,
      label: t('settings.sections.integrations'),
      render: () => (
        <div className="h-full flex-1 overflow-hidden">
          <IntegrationSection />
        </div>
      ),
    },
    {
      id: 'local_ai',
      icon: Sparkles,
      label: t('settings.sections.local_ai'),
      render: () => scrolled(withReset(<AiSection />, () => resetSettingsGroups(['ai']))),
    },
    ...(aiEnabled
      ? [
          {
            id: 'ai_commit' as const,
            icon: GitCommitHorizontal,
            label: t('settings.sections.ai_commit'),
            render: () =>
              scrolled(
                withReset(<AiCommitSection />, () =>
                  resetSettingsFields('git', ['commitInstructions', 'commitPattern'])
                )
              ),
          },
        ]
      : []),
    {
      id: 'external_tools',
      icon: Wrench,
      label: t('settings.sections.external_tools'),
      render: () =>
        scrolled(withReset(<ExternalToolsSection />, () => resetSettingsGroups(['externalTools']))),
    },
    {
      id: 'notifications',
      icon: Bell,
      label: t('settings.sections.notifications'),
      render: () =>
        scrolled(withReset(<NotificationSection />, () => resetSettingsGroups(['notifications']))),
    },
    {
      id: 'ui_customization',
      icon: Palette,
      label: t('settings.sections.ui_customization'),
      render: () =>
        scrolled(withReset(<AppearanceSection />, () => resetSettingsGroups(['appearance']))),
    },
    {
      id: 'rewards',
      icon: Trophy,
      label: t('settings.sections.rewards') || 'Succès & Récompenses',
      render: () => scrolled(<RewardsSection />),
    },
    {
      id: 'debug',
      icon: Bug,
      label: t('settings.sections.debug') || 'Debug',
      render: () => scrolled(<DebugSection />),
    },
    {
      id: 'changelog',
      icon: ScrollText,
      label: t('settings.sections.changelog'),
      render: () => scrolled(<ChangelogSection />),
    },
    {
      id: 'support',
      label: t('settings.sections.support'),
      icon: Heart,
      render: () => scrolled(<SupportSection />),
    },
  ])

  // Support is pinned to the bottom of the panel, so it's rendered apart from the scrolling group.
  const supportTab = SETTINGS_TABS.find((tab) => tab.id === 'support')
  const globalTabs = SETTINGS_TABS.filter((tab) => tab.id !== 'support')

  const LOCAL_TABS: { id: LocalSection; label: string; icon: LucideIcon }[] = [
    { id: 'gitflow', label: t('settings.sections.gitflow'), icon: GitBranch },
    { id: 'appearance', label: t('settings.sections.ui_customization'), icon: Palette },
    ...(aiEnabled
      ? [{ id: 'ai_commit' as const, label: t('settings.sections.ai_commit'), icon: GitCommitHorizontal }]
      : []),
    { id: 'worktree', label: t('settings.sections.worktree'), icon: FolderTree },
    { id: 'run', label: t('settings.sections.run'), icon: Play },
  ]

  // The Repository group only makes sense with a workspace open; without one, the side panel shows
  // only the Global group.
  const showLocalScope = !!activeRepo
  const effectiveScope: Scope = showLocalScope ? scope : 'general'
  // The Repository group is labelled with the project name (last path segment) rather than a
  // generic "Local", so it's clear which workspace's settings are being edited.
  const projectName = activeRepo?.split('/').filter(Boolean).pop() ?? ''

  return (
    <div data-testid="settings-page" className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header
        data-tauri-drag-region
        className={`chrome-surface flex shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 py-3 ${
          isMac ? 'pl-[72px]' : ''
        }`}
      >
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onClose}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </Button>
        <h1 className="text-sm font-semibold">{t('settings.title')}</h1>
      </header>

      {/* Body — a single side panel holds both the Global and the Repository configuration groups
          (the top-level scope tab bar was removed in favour of this grouped nav). */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left nav / side panel — groups scroll, the Support entry is pinned to the bottom. */}
        <nav className="chrome-surface flex w-44 shrink-0 flex-col border-r border-border bg-sidebar p-2">
          <div className="flex-1 overflow-y-auto">
            {/* Global configuration group */}
            <p
              data-testid="settings-group-global"
              className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70"
            >
              {t('settings.scope.global')}
            </p>
            {globalTabs.map((tab) => (
              <NavItem
                key={tab.id}
                testId={`settings-tab-${tab.id}`}
                icon={tab.icon}
                label={tab.label}
                active={effectiveScope === 'general' && activeSection === tab.id}
                onClick={() => {
                  setScope('general')
                  setActiveSection(tab.id)
                }}
              />
            ))}

            {/* Repository configuration group — only when a workspace is open */}
            {showLocalScope && (
              <>
                <p
                  data-testid="settings-group-repository"
                  title={activeRepo ?? undefined}
                  className="mt-3 truncate px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70"
                >
                  {t('settings.scope.repository')}
                  {projectName && (
                    <span className="ml-1 normal-case text-muted-foreground/50">· {projectName}</span>
                  )}
                </p>
                {LOCAL_TABS.map((tab) => (
                  <NavItem
                    key={tab.id}
                    testId={`settings-local-tab-${tab.id}`}
                    icon={tab.icon}
                    label={tab.label}
                    active={effectiveScope === 'local' && activeLocal === tab.id}
                    onClick={() => {
                      setScope('local')
                      setActiveLocal(tab.id)
                    }}
                  />
                ))}
              </>
            )}
          </div>

          {/* Support — pinned to the bottom of the panel, visually separated from the groups. */}
          {supportTab && (
            <div className="mt-2 shrink-0 border-t border-border pt-2">
              <NavItem
                testId={`settings-tab-${supportTab.id}`}
                icon={supportTab.icon}
                iconClassName="text-red-500"
                label={supportTab.label}
                active={effectiveScope === 'general' && activeSection === supportTab.id}
                onClick={() => {
                  setScope('general')
                  setActiveSection(supportTab.id)
                }}
              />
            </div>
          )}
        </nav>

        {/* Content */}
        {effectiveScope === 'local'
          ? scrolled(
              withReset(<RepositorySection category={activeLocal} />, () =>
                resetLocalCategory(activeLocal)
              )
            )
          : renderActiveTab(SETTINGS_TABS, activeSection)}
      </div>
    </div>
  )
}
