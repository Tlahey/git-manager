import { useState } from 'react'
import { useReposStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../../stores/repos.store'
import { LayoutDashboard, Rocket, Settings, X, GitBranch } from 'lucide-react'
import { NewTabMenu } from './NewTabMenu'
import { UserProfile } from '../action-toolbar/UserProfile'

interface TabBarProps {
  onOpenSettings: (section?: 'llm' | 'github' | 'git' | 'appearance' | 'language' | 'advanced') => void
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
    <div className="relative group/tab flex items-stretch">
      <button
        onClick={onClick}
        className={`group relative flex h-9 items-center gap-2 border-r border-border px-3 text-xs transition-colors ${
          active
            ? 'bg-background text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
            : 'text-muted-foreground hover:bg-background/40 hover:text-foreground'
        }`}
      >
        {icon}
        {!hideLabel && <span className="font-medium">{label}</span>}
      </button>
      {hideLabel && (
        <div className="absolute top-[38px] left-1/2 -translate-x-1/2 hidden group-hover/tab:block bg-popover text-popover-foreground border border-border text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap shadow-md z-50 pointer-events-none">
          {label}
        </div>
      )}
    </div>
  )
}

const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac')

export function TabBar({ onOpenSettings }: TabBarProps) {
  const { openTabs, activeTab, repoCache, setActiveTab, closeTab, reorderTabs } = useReposStore()
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
    <div
      data-tauri-drag-region
      className={`flex h-9 shrink-0 items-stretch border-b border-border bg-card ${
        isMac ? 'pl-[72px]' : ''
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
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden"
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
              className={`group relative flex h-9 min-w-[120px] max-w-[200px] shrink-0 items-center gap-2 border-r border-border px-3 text-xs transition-colors ${
                isActive
                  ? 'bg-background text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                  : 'text-muted-foreground hover:bg-background/40 hover:text-foreground'
              } ${dragIndex === index ? 'opacity-40' : ''} ${
                isDragOver ? 'before:absolute before:bottom-0 before:left-0 before:top-0 before:w-0.5 before:bg-primary' : ''
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

        {/* Bouton + (nouveau) — en ligne juste après les onglets */}
        <div className="flex shrink-0 items-center px-1">
          <NewTabMenu />
        </div>
      </div>

      {/* Réglages & Profil (extrême droite) */}
      <div className="flex shrink-0 items-center gap-2 border-l border-border px-3">
        <button
          onClick={() => onOpenSettings('llm')}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Réglages"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <UserProfile onOpenSettings={onOpenSettings} />
      </div>
    </div>
  )
}
