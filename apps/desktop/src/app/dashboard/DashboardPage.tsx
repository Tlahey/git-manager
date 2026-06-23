import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { FolderOpen, FolderSearch, Settings, GitBranch, GitMerge } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { openRepo, scanRepos } from '../../lib/tauri'
import { useReposStore } from '../../stores/repos.store'

interface DashboardPageProps {
  onOpenSettings: () => void
}

export function DashboardPage({ onOpenSettings }: DashboardPageProps) {
  const { t } = useTranslation('dashboard')
  const { savedRepos, addRepo, openTab } = useReposStore()
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  async function handleOpenRepo() {
    setError(null)
    try {
      const selected = await open({ directory: true, multiple: false })
      if (!selected || typeof selected !== 'string') return
      const repo = await openRepo(selected)
      addRepo(repo)
      openTab(repo.path)
    } catch (err) {
      setError(String(err))
    }
  }

  async function handleScanRepos() {
    setError(null)
    setScanning(true)
    try {
      const selected = await open({ directory: true, multiple: false })
      if (!selected || typeof selected !== 'string') return
      const paths = await scanRepos(selected, 4)
      for (const repoPath of paths) {
        try {
          const repo = await openRepo(repoPath)
          addRepo(repo)
        } catch {
          // Ignorer les dossiers non-git valides
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Barre de titre / header */}
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">{t('dashboard.title')}</h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleOpenRepo}>
            <FolderOpen className="mr-1 h-4 w-4" />
            {t('dashboard.openRepo')}
          </Button>
          <Button size="sm" variant="outline" onClick={handleScanRepos} disabled={scanning}>
            <FolderSearch className="mr-1 h-4 w-4" />
            {scanning ? t('dashboard.scanning') : t('dashboard.scanFolder')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onOpenSettings} title="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>
      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Contenu principal */}
      <main className="flex flex-1 overflow-hidden">
        {savedRepos.length === 0 ? (
          <EmptyState onOpenRepo={handleOpenRepo} />
        ) : (
          <RepoGrid />
        )}
      </main>
    </div>
  )
}

function EmptyState({ onOpenRepo }: { onOpenRepo: () => void }) {
  const { t } = useTranslation('dashboard')

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
      <FolderOpen className="h-16 w-16 opacity-20" />
      <p className="text-sm">{t('dashboard.noRepos')}</p>
      <Button variant="outline" onClick={onOpenRepo}>
        <FolderOpen className="mr-2 h-4 w-4" />
        {t('dashboard.openRepo')}
      </Button>
    </div>
  )
}

function RepoGrid() {
  const { savedRepos, openTab } = useReposStore()

  return (
    <div className="grid flex-1 auto-rows-max grid-cols-3 gap-4 overflow-y-auto p-4">
      {savedRepos.map((repo) => (
        <div
          key={repo.path}
          className="group cursor-pointer rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:bg-accent hover:shadow-sm"
          onClick={() => openTab(repo.path)}
        >
          <div className="mb-2 flex items-center gap-2">
            <GitBranch className="h-4 w-4 shrink-0 text-primary/70" />
            <p className="font-medium text-foreground">{repo.name}</p>
          </div>
          <p className="truncate text-xs text-muted-foreground">{repo.path}</p>
        </div>
      ))}
    </div>
  )
}
