import { useState } from 'react'
import { useRepoDataStore } from '../../stores/repoData.store'
import {
  useRepoUIStore,
  DASHBOARD_TAB,
  REWARDS_TAB,
  PULL_REQUESTS_TAB,
} from '../../stores/repoUI.store'
import { useDevFixtureReposStore } from '../../stores/devFixtureRepos.store'
import { LayoutDashboard, Trophy, Rocket, Settings, X, GitBranch, FlaskConical } from 'lucide-react'
import { useGameStore } from '../../stores/game.store'
import { NewTabMenu } from './NewTabMenu'
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
        className={`group relative flex h-7 items-center gap-2 rounded-md px-3 text-xs transition-colors ${
          active
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
        }`}
      >
        {icon}
        {!hideLabel && <span className="font-medium">{label}</span>}
      </button>
      {hideLabel && (
        <div className="pointer-events-none absolute left-1/2 top-[34px] z-50 hidden -translate-x-1/2 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 text-[10px] text-popover-foreground shadow-md group-hover/tab:block">
          {label}
        </div>
      )}
    </div>
  )
}

const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac')

export function TabBar({ onOpenSettings }: TabBarProps) {
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
      {/* Zone de drag supplémentaire pour faciliter le déplacement de la fenêtre (hauteur: --tab-bar-drag-spacer-height) */}
      <div
        data-tauri-drag-region
        className="shrink-0"
        style={{ height: 'var(--tab-bar-drag-spacer-height)' }}
      />
      <div
        data-tauri-drag-region
        className={`flex h-9 shrink-0 items-stretch gap-0.5 border-b border-border bg-card pr-1 ${
          isMac ? 'pl-[72px]' : 'pl-1'
        }`}
      >
        {/* Onglet Dashboard (épinglé) */}
        <PinnedTab
          icon={<LayoutDashboard className="h-3.5 w-3.5" />}
          label="Accueil"
          active={activeTab === DASHBOARD_TAB}
          onClick={() => setActiveTab(DASHBOARD_TAB)}
          hideLabel={true}
        />

        {/* Onglet Rewards (épinglé) */}
        {rewardsEnabled && (
          <PinnedTab
            icon={<Trophy className="h-3.5 w-3.5 text-amber-500" />}
            label="Succès & Trophées"
            active={activeTab === REWARDS_TAB}
            onClick={() => setActiveTab(REWARDS_TAB)}
            hideLabel={true}
          />
        )}

        {/* Onglet Launchpad (épinglé) */}
        <PinnedTab
          icon={<Rocket className="h-3.5 w-3.5" />}
          label="Launchpad"
          active={activeTab === PULL_REQUESTS_TAB}
          onClick={() => setActiveTab(PULL_REQUESTS_TAB)}
        />

        {/* Onglets repos (fermables, réordonnables, style Chrome) */}
        <div
          data-tauri-drag-region
          className="tab-strip-scroll flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto overflow-y-hidden"
        >
          {openTabs.map((path, index) => {
            const name = repoCache[path]?.name ?? path.split('/').pop() ?? path
            const isActive = path === activeTab
            const isDragOver = overIndex === index && dragIndex !== null && dragIndex !== index
            return (
              <button
                key={path}
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
                className={`group relative flex h-7 min-w-[120px] max-w-[200px] shrink-0 items-center gap-2 rounded-md px-3 text-xs transition-colors ${
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                } ${dragIndex === index ? 'opacity-40' : ''} ${
                  isDragOver
                    ? 'before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0.5 before:bg-primary'
                    : ''
                }`}
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate text-left font-medium">{name}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  className={`ml-auto rounded p-0.5 transition-opacity hover:bg-destructive/20 ${
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

          {/* Onglets de fixtures dev (pnpm dev:import-repo) — jamais persistés, cf. devFixtureRepos.store.ts */}
          {fixtures.map((fixture) => {
            const isActive = fixture.path === activeTab
            return (
              <button
                key={fixture.path}
                title={fixture.description}
                onClick={() => setActiveRepo(fixture.path)}
                className={`group relative flex h-7 min-w-[120px] max-w-[200px] shrink-0 items-center gap-2 rounded-md border border-dashed border-amber-500/50 px-3 text-xs transition-colors ${
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                }`}
              >
                <FlaskConical className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="flex-1 truncate text-left font-medium">{fixture.name}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  className={`ml-auto rounded p-0.5 transition-opacity hover:bg-destructive/20 ${
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

          {/* Bouton + (nouveau) — en ligne juste après les onglets */}
          <div className="flex shrink-0 items-center px-1">
            <NewTabMenu />
          </div>
        </div>

        {/* Réglages & Profil (extrême droite) */}
        <div className="flex shrink-0 items-center gap-2 border-l border-border px-3">
          <NotificationDropdown />
          <button
            onClick={() => onOpenSettings('general')}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Réglages"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <UserProfile onOpenSettings={onOpenSettings} />
        </div>
      </div>
    </>
  )
}
