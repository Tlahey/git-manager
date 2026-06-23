import { useState } from 'react'
import { useReposStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../../stores/repos.store'
import { LayoutDashboard, GitPullRequest, Settings, X, GitBranch } from 'lucide-react'
import { NewTabMenu } from './NewTabMenu'

interface TabBarProps {
  onOpenSettings: () => void
}

interface PinnedTabProps {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}

function PinnedTab({ icon, label, active, onClick }: PinnedTabProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex h-9 items-center gap-2 border-r border-border px-3 text-xs transition-colors ${
        active
          ? 'bg-background text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
          : 'text-muted-foreground hover:bg-background/40 hover:text-foreground'
      }`}
      title={label}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  )
}

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
    <div className="flex h-9 shrink-0 items-stretch border-b border-border bg-card">
      {/* Onglet Dashboard (épinglé) */}
      <PinnedTab
        icon={<LayoutDashboard className="h-3.5 w-3.5" />}
        label="Accueil"
        active={activeTab === DASHBOARD_TAB}
        onClick={() => setActiveTab(DASHBOARD_TAB)}
      />

      {/* Onglet Pull Requests (épinglé) */}
      <PinnedTab
        icon={<GitPullRequest className="h-3.5 w-3.5" />}
        label="Pull Requests"
        active={activeTab === PULL_REQUESTS_TAB}
        onClick={() => setActiveTab(PULL_REQUESTS_TAB)}
      />

      {/* Onglets repos (fermables, réordonnables, style Chrome) */}
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden">
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

      {/* Réglages (extrême droite) */}
      <button
        onClick={onOpenSettings}
        className="flex h-9 w-9 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground"
        title="Réglages"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
