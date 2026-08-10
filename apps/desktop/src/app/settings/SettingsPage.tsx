import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { ArrowLeft, Search } from 'lucide-react'
import { RepositorySection } from './components/RepositorySection'
import { SidebarUpdater } from './components/SidebarUpdater'
import { SettingsNavItem } from './components/SettingsNavItem'
import { buildSettingsTabs, buildLocalTabs, scrolled, withReset } from './settingsTabs.config'
import { createTabMatcher, normalizeQuery, LOCAL_KEYWORD_ID } from './lib/settingsSearch'
import { renderActiveTab } from '../../lib/navigation/tabRegistry'
import { useSettingsStore } from '../../stores/settings.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useCanonicalRepoPath } from '../../hooks/useCanonicalRepoPath'
import { highlightMatch } from '../../lib/highlightMatch'
import { SettingsSearchProvider } from './components/settingsSearch'
import type { Section, Scope, LocalSection } from './sections'

export type { Section, Scope } from './sections'

interface SettingsPageProps {
  onClose: () => void
  initialSection?: Section
  /** Opens straight on the Repository (local) scope instead of the global one — used by callers
   * pointing at a per-repo setting, e.g. the toolbar's merge-target popover. */
  initialScope?: Scope
}

const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac')

export function SettingsPage({ onClose, initialSection, initialScope }: SettingsPageProps) {
  const { t } = useTranslation('settings')
  const [scope, setScope] = useState<Scope>(initialScope ?? 'general')
  const [activeSection, setActiveSection] = useState<Section>(initialSection || 'general')
  const [activeLocal, setActiveLocal] = useState<LocalSection>('gitflow')
  const [query, setQuery] = useState('')
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
      resetRepoSetting(activeRepo, 'terminalBackground')
      resetRepoSetting(activeRepo, 'terminalForeground')
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
      resetRepoSetting(activeRepo, 'targetBranches')
    }
  }

  const SETTINGS_TABS = buildSettingsTabs({
    t,
    aiEnabled,
    reset: {
      // Commit style lives on its own AI-commit page, so General resets only its own fields.
      general: () => {
        resetSettingsFields('git', [
          'defaultAuthorName',
          'defaultAuthorEmail',
          'initialGraphCommits',
          'lazyLoadGraphCommits',
          'autoPrune',
          'autoFetchIntervalMinutes',
        ])
        resetSettingsGroups(['advanced'])
      },
      ssh: () => resetSettingsGroups(['ssh']),
      ai: () => resetSettingsGroups(['ai']),
      aiFeatures: () => {
        // Both halves of the page: the commit guidance and the briefing toggles.
        resetSettingsFields('git', ['commitInstructions', 'commitPattern'])
        resetSettingsGroups(['dailySummary'])
      },
      externalTools: () => resetSettingsGroups(['externalTools']),
      notifications: () => resetSettingsGroups(['notifications']),
      board: () => resetSettingsGroups(['board']),
      appearance: () => resetSettingsGroups(['appearance']),
    },
  })

  // Support is pinned to the bottom of the panel, so it's rendered apart from the scrolling group.
  const supportTab = SETTINGS_TABS.find((tab) => tab.id === 'support')
  const globalTabs = SETTINGS_TABS.filter((tab) => tab.id !== 'support')

  const LOCAL_TABS = buildLocalTabs({ t, aiEnabled })

  // The Repository group only makes sense with a workspace open; without one, the side panel shows
  // only the Global group.
  const showLocalScope = !!activeRepo
  const effectiveScope: Scope = showLocalScope ? scope : 'general'
  // The Repository group is labelled with the project name (last path segment) rather than a
  // generic "Local", so it's clear which workspace's settings are being edited.
  const projectName = activeRepo?.split('/').filter(Boolean).pop() ?? ''

  // ── Settings search ──────────────────────────────────────────────────────────
  const tabMatches = createTabMatcher(query, t)
  const searchQuery = normalizeQuery(query)
  const isSearching = query.trim() !== ''

  const visibleGlobalTabs = globalTabs.filter((tab) =>
    tabMatches(tab.label, `settings.search.keywords.${tab.id}`)
  )
  const visibleLocalTabs = LOCAL_TABS.filter((tab) =>
    tabMatches(tab.label, `settings.search.keywords.${LOCAL_KEYWORD_ID[tab.id]}`)
  )
  const supportMatches = supportTab
    ? tabMatches(supportTab.label, 'settings.search.keywords.support')
    : false
  const noResults =
    isSearching &&
    visibleGlobalTabs.length === 0 &&
    visibleLocalTabs.length === 0 &&
    !supportMatches

  return (
    <div
      data-testid="settings-page"
      className="flex h-screen flex-col bg-background text-foreground"
    >
      {/* Header */}
      <header
        data-tauri-drag-region
        className={`chrome-surface flex shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 py-3 ${
          isMac ? 'pl-[72px]' : ''
        }`}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={onClose}
          data-testid="settings-back"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('settings.back')}
        </Button>
        <h1 className="text-sm font-semibold">{t('settings.title')}</h1>
      </header>

      {/* Body — a single side panel holds both the Global and the Repository configuration groups
          (the top-level scope tab bar was removed in favour of this grouped nav). */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left nav / side panel — groups scroll, the Support entry is pinned to the bottom. */}
        <nav className="chrome-surface flex w-44 shrink-0 flex-col border-r border-border bg-sidebar p-2">
          {/* Quick search across every settings page */}
          <div className="relative mb-2 shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('settings.search.placeholder')}
              data-testid="settings-search"
              className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-7 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-hidden"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Global configuration group */}
            {visibleGlobalTabs.length > 0 && (
              <p
                data-testid="settings-group-global"
                className="px-3 pt-1 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase"
              >
                {t('settings.scope.global')}
              </p>
            )}
            {visibleGlobalTabs.map((tab) => (
              <SettingsNavItem
                key={tab.id}
                testId={`settings-tab-${tab.id}`}
                icon={tab.icon}
                label={highlightMatch(tab.label, query)}
                active={effectiveScope === 'general' && activeSection === tab.id}
                onClick={() => {
                  setScope('general')
                  setActiveSection(tab.id)
                }}
              />
            ))}

            {/* Repository configuration group — only when a workspace is open */}
            {showLocalScope && visibleLocalTabs.length > 0 && (
              <>
                <p
                  data-testid="settings-group-repository"
                  title={activeRepo ?? undefined}
                  className="mt-3 truncate px-3 pt-1 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase"
                >
                  {t('settings.scope.repository')}
                  {projectName && (
                    <span className="ml-1 text-muted-foreground/50 normal-case">
                      · {projectName}
                    </span>
                  )}
                </p>
                {visibleLocalTabs.map((tab) => (
                  <SettingsNavItem
                    key={tab.id}
                    testId={`settings-local-tab-${tab.id}`}
                    icon={tab.icon}
                    label={highlightMatch(tab.label, query)}
                    active={effectiveScope === 'local' && activeLocal === tab.id}
                    onClick={() => {
                      setScope('local')
                      setActiveLocal(tab.id)
                    }}
                  />
                ))}
              </>
            )}

            {noResults && (
              <p
                data-testid="settings-search-no-results"
                className="px-3 pt-2 text-[11px] text-muted-foreground"
              >
                {t('settings.search.noResults')}
              </p>
            )}
          </div>

          {/* Support — pinned to the bottom of the panel, visually separated from the groups. */}
          {supportTab && supportMatches && (
            <div className="mt-2 shrink-0 border-t border-border pt-2">
              <SettingsNavItem
                testId={`settings-tab-${supportTab.id}`}
                icon={supportTab.icon}
                iconClassName="text-red-500"
                label={highlightMatch(supportTab.label, query)}
                active={effectiveScope === 'general' && activeSection === supportTab.id}
                onClick={() => {
                  setScope('general')
                  setActiveSection(supportTab.id)
                }}
              />
            </div>
          )}

          {/* App updater — pinned below Support, highlights when a new version is available. */}
          <SidebarUpdater />
        </nav>

        {/* Content — the search query filters/highlights individual settings inside each page. */}
        <SettingsSearchProvider query={searchQuery}>
          {effectiveScope === 'local'
            ? scrolled(
                withReset(<RepositorySection category={activeLocal} />, () =>
                  resetLocalCategory(activeLocal)
                )
              )
            : renderActiveTab(SETTINGS_TABS, activeSection)}
        </SettingsSearchProvider>
      </div>
    </div>
  )
}
