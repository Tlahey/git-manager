import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, ScrollArea } from '@git-manager/ui'
import { ArrowLeft, Heart } from 'lucide-react'
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

/** The Local scope's own side-menu pages, mirroring the matching global sections. */
type LocalSection = 'general' | 'appearance' | 'ai_commit'

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

export function SettingsPage({ onClose, initialSection }: SettingsPageProps) {
  const { t } = useTranslation('settings')
  const [scope, setScope] = useState<Scope>('general')
  const [activeSection, setActiveSection] = useState<Section>(initialSection || 'general')
  const [activeLocal, setActiveLocal] = useState<LocalSection>('general')
  const resetSettingsGroups = useSettingsStore((s) => s.resetSettingsGroups)
  const resetSettingsFields = useSettingsStore((s) => s.resetSettingsFields)
  const resetRepoSetting = useSettingsStore((s) => s.resetRepoSetting)
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  // AI-scoped pages (the AI-commit section) only show when AI is enabled. `undefined` = enabled.
  const aiEnabled = useSettingsStore((s) => s.settings.ai.enabled !== false)

  /** Reverts the active repo's overrides for the given Local page back to inheriting the global. */
  function resetLocalCategory(cat: LocalSection) {
    if (!activeRepo) return
    if (cat === 'appearance') {
      resetRepoSetting(activeRepo, 'theme')
    } else if (cat === 'ai_commit') {
      resetRepoSetting(activeRepo, 'commitInstructions')
      resetRepoSetting(activeRepo, 'commitPattern')
    } else {
      resetRepoSetting(activeRepo, 'protectedBranches')
    }
  }

  const SETTINGS_TABS: TabDef<Section>[] = defineTabs([
    {
      id: 'general',
      // Commit style lives on its own AI-commit page, so General resets only its own fields.
      render: () =>
        scrolled(
          withReset(<GeneralSection />, () => {
            resetSettingsFields('git', ['defaultAuthorName', 'defaultAuthorEmail', 'protectedBranches'])
            resetSettingsGroups(['advanced'])
          })
        ),
      label: t('settings.sections.general'),
    },
    {
      id: 'ssh',
      label: t('settings.sections.ssh'),
      render: () => scrolled(withReset(<SshSection />, () => resetSettingsGroups(['ssh']))),
    },
    {
      id: 'integrations',
      label: t('settings.sections.integrations'),
      render: () => (
        <div className="h-full flex-1 overflow-hidden p-6">
          <IntegrationSection />
        </div>
      ),
    },
    {
      id: 'local_ai',
      label: t('settings.sections.local_ai'),
      render: () => scrolled(withReset(<AiSection />, () => resetSettingsGroups(['ai']))),
    },
    ...(aiEnabled
      ? [
          {
            id: 'ai_commit' as const,
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
      label: t('settings.sections.external_tools'),
      render: () =>
        scrolled(withReset(<ExternalToolsSection />, () => resetSettingsGroups(['externalTools']))),
    },
    {
      id: 'notifications',
      label: t('settings.sections.notifications'),
      render: () =>
        scrolled(withReset(<NotificationSection />, () => resetSettingsGroups(['notifications']))),
    },
    {
      id: 'ui_customization',
      label: t('settings.sections.ui_customization'),
      render: () =>
        scrolled(withReset(<AppearanceSection />, () => resetSettingsGroups(['appearance']))),
    },
    {
      id: 'rewards',
      label: t('settings.sections.rewards') || 'Succès & Récompenses',
      render: () => scrolled(<RewardsSection />),
    },
    {
      id: 'debug',
      label: t('settings.sections.debug') || 'Debug',
      render: () => scrolled(<DebugSection />),
    },
    {
      id: 'changelog',
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

  const LOCAL_TABS: { id: LocalSection; label: string }[] = [
    { id: 'general', label: t('settings.sections.general') },
    { id: 'appearance', label: t('settings.sections.ui_customization') },
    ...(aiEnabled
      ? [{ id: 'ai_commit' as const, label: t('settings.sections.ai_commit') }]
      : []),
  ]

  // The Local scope only makes sense with a workspace open; without one, there's only the global
  // scope (and no scope tab bar to choose from).
  const showLocalScope = !!activeRepo
  const effectiveScope: Scope = showLocalScope ? scope : 'general'
  // The Local tab is labelled with the project name (last path segment) rather than a generic
  // "Local", so it's clear which workspace's settings are being edited.
  const projectName = activeRepo?.split('/').filter(Boolean).pop() ?? ''

  return (
    <div data-testid="settings-page" className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header
        data-tauri-drag-region
        className={`flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 ${
          isMac ? 'pl-[72px]' : ''
        }`}
      >
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onClose}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </Button>
        <h1 className="text-sm font-semibold">{t('settings.title')}</h1>
      </header>

      {/* Top-level scope tabs — placed in the content (not the header) so they read as the primary
          split the user chooses between: global settings vs. the current workspace. Only shown when
          a workspace is open (otherwise there's nothing "local" to configure). */}
      {showLocalScope && (
        <div className="flex shrink-0 gap-1 border-b border-border px-4">
          {(['general', 'local'] as const).map((s) => (
            <button
              key={s}
              data-testid={`settings-scope-${s}`}
              onClick={() => setScope(s)}
              title={s === 'local' ? activeRepo ?? undefined : undefined}
              className={`-mb-px max-w-[200px] cursor-pointer truncate border-b-2 px-4 py-2.5 text-sm transition-colors ${
                scope === s
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'local' ? projectName : t('settings.scope.general')}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      {effectiveScope === 'local' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Left nav (mirrors the global one, with only the repo-overridable pages) */}
          <nav className="w-44 shrink-0 border-r border-border bg-muted/20 p-2">
            {LOCAL_TABS.map((tab) => (
              <button
                key={tab.id}
                data-testid={`settings-local-tab-${tab.id}`}
                onClick={() => setActiveLocal(tab.id)}
                className={`w-full cursor-pointer rounded px-3 py-2 text-left text-xs transition-colors ${
                  activeLocal === tab.id
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          {scrolled(
            withReset(<RepositorySection category={activeLocal} />, () =>
              resetLocalCategory(activeLocal)
            )
          )}
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left nav */}
          <nav className="w-44 shrink-0 border-r border-border bg-muted/20 p-2">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  data-testid={`settings-tab-${tab.id}`}
                  onClick={() => setActiveSection(tab.id)}
                  className={`flex w-full cursor-pointer items-center gap-1.5 rounded px-3 py-2 text-left text-xs transition-colors ${
                    activeSection === tab.id
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 text-red-500" />}
                  {tab.label}
                </button>
              )
            })}
          </nav>

          {/* Content */}
          {renderActiveTab(SETTINGS_TABS, activeSection)}
        </div>
      )}
    </div>
  )
}
