import { useState } from 'react'
import { useRepoDataStore } from '../../stores/repoData.store'
import {
  useRepoUIStore,
  isNewTab,
  DASHBOARD_TAB,
  REWARDS_TAB,
  PULL_REQUESTS_TAB,
} from '../../stores/repoUI.store'
import { useDevFixtureReposStore } from '../../stores/devFixtureRepos.store'
import { useTranslation } from '@git-manager/i18n'
import {
  LayoutDashboard,
  Trophy,
  Rocket,
  Settings,
  X,
  GitBranch,
  FlaskConical,
  Plus,
} from 'lucide-react'
import { useGameStore } from '../../stores/game.store'
import { UserProfile } from '../action-toolbar/UserProfile'
import { NotificationDropdown } from '../notification/NotificationDropdown'
import type { Section } from '../../app/settings/SettingsPage'

interface TabBarProps {
  onOpenSettings: (section?: Section) => void
}

interface PinnedTabProps {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  hideLabel?: boolean
}

function PinnedTab({ icon, label, active, onClick, hideLabel }: PinnedTabProps) {
  return (
    <div className="group/tab relative flex items-end self-end">
      <button
        onClick={onClick}
        className={`group relative flex h-7 cursor-pointer items-center gap-2 rounded-md px-3 text-xs transition-colors ${
          active
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'
        }`}
      >
        {icon}
        {!hideLabel && <span className="font-medium">{label}</span>}
      </button>
      {hideLabel && (
        <div className="pointer-events-none absolute top-[34px] left-1/2 z-popover hidden -translate-x-1/2 rounded border border-border bg-popover px-1.5 py-0.5 text-[10px] whitespace-nowrap text-popover-foreground shadow-md group-hover/tab:block">
          {label}
        </div>
      )}
    </div>
  )
}

const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac')

export function TabBar({ onOpenSettings }: TabBarProps) {
  const { t } = useTranslation('common')
  const { openTabs, activeTab, setActiveTab, setActiveRepo, closeTab, reorderTabs } =
    useRepoUIStore()
  const { repoCache } = useRepoDataStore()
  const { fixtures, removeFixture } = useDevFixtureReposStore()
  const rewardsEnabled = useGameStore((s) => s.rewardsEnabled)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function handleDrop(targetIndex: number) {
    if (dragIndex !== null && dragIndex !== targetIndex) {
      reorderTabs(dragIndex, targetIndex)
    }
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <>
      {/* Extra drag area making the window easier to move (height: --tab-bar-drag-spacer-height).
          bg-sidebar blends it into the chrome colour like the tab strip below it — without which it
          lets the light --background (white on Twilight) show through above the dark tabs. */}
      <div
        data-tauri-drag-region
        className="shrink-0 bg-sidebar"
        style={{ height: 'var(--tab-bar-drag-spacer-height)' }}
      />
      <div
        data-tauri-drag-region
        data-testid="tab-bar"
        className={`flex h-9 shrink-0 items-stretch gap-0.5 border-b border-sidebar-border bg-sidebar pr-1 ${
          isMac ? 'pl-[72px]' : 'pl-1'
        }`}
      >
        {/* Dashboard tab (pinned) */}
        <PinnedTab
          icon={<LayoutDashboard className="h-3.5 w-3.5" />}
          label={t('tabs.dashboard')}
          active={activeTab === DASHBOARD_TAB}
          onClick={() => setActiveTab(DASHBOARD_TAB)}
          hideLabel={true}
        />

        {/* Rewards tab (pinned) */}
        {rewardsEnabled && (
          <PinnedTab
            icon={<Trophy className="h-3.5 w-3.5 text-amber-500" />}
            label={t('tabs.rewards')}
            active={activeTab === REWARDS_TAB}
            onClick={() => setActiveTab(REWARDS_TAB)}
            hideLabel={true}
          />
        )}

        {/* Launchpad tab (pinned) */}
        <PinnedTab
          icon={<Rocket className="h-3.5 w-3.5" />}
          label="Launchpad"
          active={activeTab === PULL_REQUESTS_TAB}
          onClick={() => setActiveTab(PULL_REQUESTS_TAB)}
        />

        {/* Repo tabs (closeable, reorderable, Chrome-style) */}
        <div
          data-tauri-drag-region
          className="tab-strip-scroll flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto overflow-y-hidden"
        >
          {openTabs.map((path, index) => {
            // An empty "New Tab" placeholder shares the strip with repo tabs (drag, close, Alt+n)
            // but has no repo behind it, so it gets its own label and icon.
            const isEmptyTab = isNewTab(path)
            const name = isEmptyTab
              ? t('newTab.tabLabel')
              : (repoCache[path]?.name ?? path.split('/').pop() ?? path)
            const isActive = path === activeTab
            const isDragOver = overIndex === index && dragIndex !== null && dragIndex !== index
            return (
              <button
                key={path}
                data-testid={isEmptyTab ? `tab-empty-${path}` : `tab-repo-${path}`}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (overIndex !== index) setOverIndex(index)
                }}
                onDrop={() => handleDrop(index)}
                onDragEnd={() => {
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onClick={() => setActiveTab(path)}
                className={`group relative flex h-7 max-w-[200px] min-w-[120px] shrink-0 cursor-pointer items-center gap-2 rounded-md px-3 text-xs transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'
                } ${dragIndex === index ? 'opacity-40' : ''} ${
                  isDragOver
                    ? 'before:absolute before:top-0 before:bottom-0 before:left-0 before:w-0.5 before:bg-primary'
                    : ''
                }`}
              >
                {isEmptyTab ? (
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <GitBranch className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="flex-1 truncate text-left font-medium">{name}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  className={`ml-auto cursor-pointer rounded p-0.5 transition-opacity hover:bg-destructive/20 ${
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(path)
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            )
          })}

          {/* Dev fixture tabs (pnpm dev:import-repo) — never persisted, see devFixtureRepos.store.ts */}
          {fixtures.map((fixture) => {
            const isActive = fixture.path === activeTab
            return (
              <button
                key={fixture.path}
                title={fixture.description}
                onClick={() => setActiveRepo(fixture.path)}
                className={`group relative flex h-7 max-w-[200px] min-w-[120px] shrink-0 cursor-pointer items-center gap-2 rounded-md border border-dashed border-amber-500/50 px-3 text-xs transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'
                }`}
              >
                <FlaskConical className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="flex-1 truncate text-left font-medium">{fixture.name}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  className={`ml-auto cursor-pointer rounded p-0.5 transition-opacity hover:bg-destructive/20 ${
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFixture(fixture.path)
                    if (isActive) setActiveTab(DASHBOARD_TAB)
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            )
          })}
        </div>

        {/* Settings & profile (far right) */}
        <div className="flex shrink-0 items-center gap-2 border-l border-sidebar-border px-3">
          <NotificationDropdown />
          <button
            onClick={() => onOpenSettings('general')}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title={t('tabs.settings')}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <UserProfile onOpenSettings={onOpenSettings} />
        </div>
      </div>
    </>
  )
}
