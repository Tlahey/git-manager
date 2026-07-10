import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input } from '@git-manager/ui'
import {
  FolderOpen,
  FolderSearch,
  Settings,
  GitMerge,
  X,
  AlertTriangle,
  Search,
  Folder,
  Terminal,
  Download,
  Star,
} from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { OctopusMascot } from '@git-manager/mascot'
import { CloneRepoDialog } from '../../components/tab-bar/CloneRepoDialog'
import { apiOpenRepo, apiScanRepos } from '../../api/repo.api'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../../stores/repoUI.store'
import { RepoRow } from './components/RepoRow'
import { ReadmePanel } from './components/ReadmePanel'

interface DashboardPageProps {
  onOpenSettings: () => void
}

export function DashboardPage({ onOpenSettings }: DashboardPageProps) {
  const { t } = useTranslation('dashboard')
  const { savedRepos, discoveredRepos, addRepo, addDiscoveredRepo } = useRepoDataStore()
  const { openTabs, openTab } = useRepoUIStore()

  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [selectedReadmePath, setSelectedReadmePath] = useState<string | null>(null)
  const [isCloneOpen, setIsCloneOpen] = useState(false)

  async function handleOpenRepo() {
    setError(null)
    try {
      const selected = await open({ directory: true, multiple: false })
      if (!selected || typeof selected !== 'string') return
      const repo = await apiOpenRepo(selected)
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
      // Scan directories up to depth 4
      const paths = await apiScanRepos(selected, 4)
      for (const repoPath of paths) {
        try {
          const name = repoPath.split('/').pop() || repoPath
          addDiscoveredRepo(repoPath, name)
        } catch (err) {
          console.error('Failed to add discovered repo:', repoPath, err)
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setScanning(false)
    }
  }

  // Filter callback matching name or path
  const filterFn = useCallback((repo: { path: string; name: string }) => {
    if (!filterText) return true
    const text = filterText.toLowerCase()
    return repo.name.toLowerCase().includes(text) || repo.path.toLowerCase().includes(text)
  }, [filterText])

  // 1. Repos currently open in tabs (excluding special dashboard & PRs tabs)
  const activeTabs = useMemo(() => {
    return openTabs
      .filter((path) => path !== DASHBOARD_TAB && path !== PULL_REQUESTS_TAB)
      .map((path) => {
        const saved = savedRepos.find((r) => r.path === path)
        const name = saved ? saved.name : path.split('/').pop() || path
        return { path, name }
      })
      .filter(filterFn)
  }, [openTabs, savedRepos, filterFn])

  // 2. Favorites repos (saved repos with pinned === true)
  const favoriteRepos = useMemo(() => {
    return savedRepos.filter((r) => r.pinned).filter(filterFn)
  }, [savedRepos, filterFn])

  // 3. All repositories (Union of savedRepos and discoveredRepos)
  const allRepos = useMemo(() => {
    const uniqueMap = new Map<string, { path: string; name: string }>()

    // Load scanned/discovered repos first
    if (discoveredRepos) {
      discoveredRepos.forEach((r) => {
        uniqueMap.set(r.path, { path: r.path, name: r.name })
      })
    }

    // Load saved repos
    savedRepos.forEach((r) => {
      uniqueMap.set(r.path, { path: r.path, name: r.name })
    })

    return Array.from(uniqueMap.values()).filter(filterFn)
  }, [discoveredRepos, savedRepos, filterFn])

  const totalKnownCount = allRepos.length

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* LEFT CONTAINER: Repo List Area */}
      <div className="flex flex-1 flex-col h-full overflow-hidden min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border bg-card/50 px-6 py-3.5 shrink-0 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-primary animate-pulse" />
            <h1 className="text-sm font-semibold text-foreground tracking-wide">
              {t('dashboard.title') || 'Tableau de bord'}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleOpenRepo} className="hover:bg-primary/10 hover:border-primary/30 transition-all text-xs h-8">
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              {t('dashboard.browse') || 'Browse'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsCloneOpen(true)} className="hover:bg-primary/10 hover:border-primary/30 transition-all text-xs h-8">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t('dashboard.clone') || 'Clone'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleScanRepos} disabled={scanning} className="hover:bg-primary/10 hover:border-primary/30 transition-all text-xs h-8">
              <FolderSearch className="mr-1.5 h-3.5 w-3.5" />
              {scanning ? (t('dashboard.scanning') || 'Scan...') : (t('dashboard.scanFolder') || 'Scanner')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onOpenSettings} title="Paramètres" className="h-8 w-8 hover:bg-accent">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {error && (
          <div className="border-b border-destructive/20 bg-destructive/10 px-6 py-2.5 text-xs text-destructive flex items-center gap-2 shrink-0">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Search input bar */}
        {totalKnownCount > 0 && (
          <div className="px-6 py-3 border-b border-border bg-muted/10 shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder={t('dashboard.searchPlaceholder') || 'Rechercher un dépôt...'}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="pl-9 h-8 text-xs bg-card border-border hover:border-border/80 focus-visible:ring-primary font-sans"
              />
              {filterText && (
                <button
                  onClick={() => setFilterText('')}
                  className="absolute right-2.5 p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable list content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {totalKnownCount === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground bg-card/20 rounded-xl border border-dashed border-border/60 p-6 max-w-lg mx-auto mt-12 shadow-sm">
              <OctopusMascot size={150} label={t('dashboard.title') || 'Git Manager'} />
              <p className="text-xs text-center leading-relaxed">
                {t('dashboard.noAllRepos') || "Aucun dépôt enregistré. Utilisez 'Ouvrir un repo' ou 'Scanner un dossier' pour commencer."}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleOpenRepo}>
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  {t('dashboard.openRepo') || 'Ouvrir un repo'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* SECTION 1: Open in Tabs */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 border-b border-border/40 pb-1.5">
                  <Terminal className="h-3.5 w-3.5 text-primary/80" />
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    {t('dashboard.openTabs') || 'Dépôts ouverts en onglet'}
                  </h3>
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full leading-none">
                    {activeTabs.length}
                  </span>
                </div>
                {activeTabs.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 italic pl-5 py-1">
                    {t('dashboard.noTabs') || 'Aucun dépôt ouvert en onglet.'}
                  </p>
                ) : (
                  <div className="divide-y divide-border/20 rounded-lg border border-border bg-card/30 shadow-sm relative">
                    {activeTabs.map((repo) => (
                      <RepoRow
                        key={repo.path}
                        path={repo.path}
                        name={repo.name}
                        isSaved={savedRepos.some((r) => r.path === repo.path)}
                        isPinned={savedRepos.find((r) => r.path === repo.path)?.pinned || false}
                        onToggleReadme={() => {
                          setSelectedReadmePath(selectedReadmePath === repo.path ? null : repo.path)
                        }}
                        isReadmeActive={selectedReadmePath === repo.path}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2: Favorites */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 border-b border-border/40 pb-1.5">
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    {t('dashboard.favorites') || 'Favoris'}
                  </h3>
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full leading-none">
                    {favoriteRepos.length}
                  </span>
                </div>
                {favoriteRepos.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 italic pl-5 py-1">
                    {t('dashboard.noFavorites') || 'Aucun dépôt favori.'}
                  </p>
                ) : (
                  <div className="divide-y divide-border/20 rounded-lg border border-border bg-card/30 shadow-sm relative">
                    {favoriteRepos.map((repo) => (
                      <RepoRow
                        key={repo.path}
                        path={repo.path}
                        name={repo.name}
                        isSaved={true}
                        isPinned={true}
                        onToggleReadme={() => {
                          setSelectedReadmePath(selectedReadmePath === repo.path ? null : repo.path)
                        }}
                        isReadmeActive={selectedReadmePath === repo.path}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 3: All Repositories */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 border-b border-border/40 pb-1.5">
                  <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    {t('dashboard.allRepos') || 'Tous les dépôts'}
                  </h3>
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full leading-none">
                    {allRepos.length}
                  </span>
                </div>
                {allRepos.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 italic pl-5 py-1">
                    {t('dashboard.noAllRepos') || 'Aucun dépôt trouvé.'}
                  </p>
                ) : (
                  <div className="divide-y divide-border/20 rounded-lg border border-border bg-card/30 shadow-sm relative">
                    {allRepos.map((repo) => (
                      <RepoRow
                        key={repo.path}
                        path={repo.path}
                        name={repo.name}
                        isSaved={savedRepos.some((r) => r.path === repo.path)}
                        isPinned={savedRepos.find((r) => r.path === repo.path)?.pinned || false}
                        onToggleReadme={() => {
                          setSelectedReadmePath(selectedReadmePath === repo.path ? null : repo.path)
                        }}
                        isReadmeActive={selectedReadmePath === repo.path}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* RIGHT CONTAINER: README Panel */}
      {selectedReadmePath && (
        <div className="w-[450px] border-l border-border h-full shrink-0 flex flex-col overflow-hidden bg-card/45 backdrop-blur shadow-2xl animate-in slide-in-from-right duration-200">
          <ReadmePanel path={selectedReadmePath} onClose={() => setSelectedReadmePath(null)} />
        </div>
      )}

      <CloneRepoDialog open={isCloneOpen} onOpenChange={setIsCloneOpen} />
    </div>
  )
}
