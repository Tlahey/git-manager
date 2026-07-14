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
import { apiScanRepos } from '../../api/repo.api'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../../stores/repoUI.store'
import { useOpenRepository } from '../../hooks/useOpenRepository'
import { useMorningSummaries } from '../../hooks/useMorningSummaries'
import { useSettingsStore } from '../../stores/settings.store'
import { RepoRow } from './components/RepoRow'
import { ReadmePanel } from './components/ReadmePanel'
import { DailySummaryPanel } from './components/DailySummaryPanel'

interface DashboardPageProps {
  onOpenSettings: () => void
}

export function DashboardPage({ onOpenSettings }: DashboardPageProps) {
  const { t } = useTranslation('dashboard')
  const { savedRepos, discoveredRepos, addDiscoveredRepo } = useRepoDataStore()
  const { openTabs } = useRepoUIStore()
  const openRepository = useOpenRepository()

  const summaryEnabled = useSettingsStore((s) => s.settings.dailySummary?.enabled ?? true)

  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [selectedReadmePath, setSelectedReadmePath] = useState<string | null>(null)
  const [selectedSummaryPath, setSelectedSummaryPath] = useState<string | null>(null)
  const [isCloneOpen, setIsCloneOpen] = useState(false)

  // The launchpad's right pane hosts either the README or the daily-summary briefing — opening one
  // closes the other so they never fight over the slot.
  const toggleReadme = useCallback((path: string) => {
    setSelectedSummaryPath(null)
    setSelectedReadmePath((cur) => (cur === path ? null : path))
  }, [])
  const toggleSummary = useCallback((path: string) => {
    setSelectedReadmePath(null)
    setSelectedSummaryPath((cur) => (cur === path ? null : path))
  }, [])

  async function handleOpenRepo() {
    setError(null)
    try {
      await openRepository()
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
  const filterFn = useCallback(
    (repo: { path: string; name: string }) => {
      if (!filterText) return true
      const text = filterText.toLowerCase()
      return repo.name.toLowerCase().includes(text) || repo.path.toLowerCase().includes(text)
    },
    [filterText]
  )

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

  // Morning auto-briefing runs only for a bounded, relevant set — the repos open in tabs plus the
  // favorites — never every discovered repo. The hook itself no-ops when the feature is disabled.
  const morningCandidatePaths = useMemo(() => {
    const set = new Set<string>()
    activeTabs.forEach((r) => set.add(r.path))
    favoriteRepos.forEach((r) => set.add(r.path))
    return Array.from(set)
  }, [activeTabs, favoriteRepos])
  useMorningSummaries(morningCandidatePaths)

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* LEFT CONTAINER: Repo List Area */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-card/50 px-6 py-3.5 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 animate-pulse text-primary" />
            <h1 className="text-sm font-semibold tracking-wide text-foreground">
              {t('dashboard.title') || 'Tableau de bord'}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button
              data-testid="open-repo-button"
              size="sm"
              variant="outline"
              onClick={handleOpenRepo}
              className="h-8 text-xs transition-all hover:border-primary/30 hover:bg-primary/10"
            >
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              {t('dashboard.browse') || 'Browse'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCloneOpen(true)}
              className="h-8 text-xs transition-all hover:border-primary/30 hover:bg-primary/10"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t('dashboard.clone') || 'Clone'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleScanRepos}
              disabled={scanning}
              className="h-8 text-xs transition-all hover:border-primary/30 hover:bg-primary/10"
            >
              <FolderSearch className="mr-1.5 h-3.5 w-3.5" />
              {scanning
                ? t('dashboard.scanning') || 'Scan...'
                : t('dashboard.scanFolder') || 'Scanner'}
            </Button>
            <Button
              data-testid="dashboard-settings-button"
              size="sm"
              variant="ghost"
              onClick={onOpenSettings}
              title="Paramètres"
              className="h-8 w-8 hover:bg-accent"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {error && (
          <div className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-6 py-2.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Search input bar */}
        {totalKnownCount > 0 && (
          <div className="shrink-0 border-b border-border bg-muted/10 px-6 py-3">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t('dashboard.searchPlaceholder') || 'Rechercher un dépôt...'}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="h-8 border-border bg-card pl-9 font-sans text-xs hover:border-border/80 focus-visible:ring-primary"
              />
              {filterText && (
                <button
                  onClick={() => setFilterText('')}
                  className="absolute right-2.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable list content */}
        <main className="flex-1 space-y-6 overflow-y-auto p-6">
          {totalKnownCount === 0 ? (
            <div className="mx-auto mt-12 flex max-w-lg flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/60 bg-card/20 p-6 text-muted-foreground shadow-sm">
              <OctopusMascot size={150} label={t('dashboard.title') || 'Git Manager'} />
              <p className="text-center text-xs leading-relaxed">
                {t('dashboard.noAllRepos') ||
                  "Aucun dépôt enregistré. Utilisez 'Ouvrir un repo' ou 'Scanner un dossier' pour commencer."}
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
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {t('dashboard.openTabs') || 'Dépôts ouverts en onglet'}
                  </h3>
                  <span className="rounded-full bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                    {activeTabs.length}
                  </span>
                </div>
                {activeTabs.length === 0 ? (
                  <p className="py-1 pl-5 text-[11px] italic text-muted-foreground/60">
                    {t('dashboard.noTabs') || 'Aucun dépôt ouvert en onglet.'}
                  </p>
                ) : (
                  <div className="relative divide-y divide-border/20 rounded-lg border border-border bg-card/30 shadow-sm">
                    {activeTabs.map((repo) => (
                      <RepoRow
                        key={repo.path}
                        path={repo.path}
                        name={repo.name}
                        isSaved={savedRepos.some((r) => r.path === repo.path)}
                        isPinned={savedRepos.find((r) => r.path === repo.path)?.pinned || false}
                        onToggleReadme={() => toggleReadme(repo.path)}
                        isReadmeActive={selectedReadmePath === repo.path}
                        onToggleSummary={() => toggleSummary(repo.path)}
                        isSummaryActive={selectedSummaryPath === repo.path}
                        summaryEnabled={summaryEnabled}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2: Favorites */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 border-b border-border/40 pb-1.5">
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {t('dashboard.favorites') || 'Favoris'}
                  </h3>
                  <span className="rounded-full bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                    {favoriteRepos.length}
                  </span>
                </div>
                {favoriteRepos.length === 0 ? (
                  <p className="py-1 pl-5 text-[11px] italic text-muted-foreground/60">
                    {t('dashboard.noFavorites') || 'Aucun dépôt favori.'}
                  </p>
                ) : (
                  <div className="relative divide-y divide-border/20 rounded-lg border border-border bg-card/30 shadow-sm">
                    {favoriteRepos.map((repo) => (
                      <RepoRow
                        key={repo.path}
                        path={repo.path}
                        name={repo.name}
                        isSaved={true}
                        isPinned={true}
                        onToggleReadme={() => toggleReadme(repo.path)}
                        isReadmeActive={selectedReadmePath === repo.path}
                        onToggleSummary={() => toggleSummary(repo.path)}
                        isSummaryActive={selectedSummaryPath === repo.path}
                        summaryEnabled={summaryEnabled}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 3: All Repositories */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 border-b border-border/40 pb-1.5">
                  <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {t('dashboard.allRepos') || 'Tous les dépôts'}
                  </h3>
                  <span className="rounded-full bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                    {allRepos.length}
                  </span>
                </div>
                {allRepos.length === 0 ? (
                  <p className="py-1 pl-5 text-[11px] italic text-muted-foreground/60">
                    {t('dashboard.noAllRepos') || 'Aucun dépôt trouvé.'}
                  </p>
                ) : (
                  <div className="relative divide-y divide-border/20 rounded-lg border border-border bg-card/30 shadow-sm">
                    {allRepos.map((repo) => (
                      <RepoRow
                        key={repo.path}
                        path={repo.path}
                        name={repo.name}
                        isSaved={savedRepos.some((r) => r.path === repo.path)}
                        isPinned={savedRepos.find((r) => r.path === repo.path)?.pinned || false}
                        onToggleReadme={() => toggleReadme(repo.path)}
                        isReadmeActive={selectedReadmePath === repo.path}
                        onToggleSummary={() => toggleSummary(repo.path)}
                        isSummaryActive={selectedSummaryPath === repo.path}
                        summaryEnabled={summaryEnabled}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* RIGHT CONTAINER: README or Daily-summary panel (mutually exclusive) */}
      {selectedSummaryPath ? (
        <div className="animate-in slide-in-from-right flex h-full w-[450px] shrink-0 flex-col overflow-hidden border-l border-border bg-card/45 shadow-2xl backdrop-blur duration-200">
          <DailySummaryPanel
            path={selectedSummaryPath}
            onClose={() => setSelectedSummaryPath(null)}
          />
        </div>
      ) : selectedReadmePath ? (
        <div className="animate-in slide-in-from-right flex h-full w-[450px] shrink-0 flex-col overflow-hidden border-l border-border bg-card/45 shadow-2xl backdrop-blur duration-200">
          <ReadmePanel path={selectedReadmePath} onClose={() => setSelectedReadmePath(null)} />
        </div>
      ) : null}

      <CloneRepoDialog open={isCloneOpen} onOpenChange={setIsCloneOpen} />
    </div>
  )
}
