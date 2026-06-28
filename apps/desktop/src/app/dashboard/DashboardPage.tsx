import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input } from '@git-manager/ui'
import {
  FolderOpen,
  FolderSearch,
  Settings,
  GitBranch,
  GitMerge,
  Star,
  BookOpen,
  Plus,
  X,
  RefreshCw,
  FileText,
  AlertTriangle,
  Search,
  Folder,
  CheckCircle2,
  Terminal,
  Code,
  Download
} from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { CloneRepoDialog } from '../../components/tab-bar/CloneRepoDialog'
import {
  openRepo,
  scanRepos,
  getRepoSummary,
  openInEditor,
  getRepoReadme
} from '../../lib/tauri'
import { useReposStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../../stores/repos.store'
import { useSettingsStore } from '../../stores/settings.store'
import { Markdown } from '../../components/Markdown'

interface DashboardPageProps {
  onOpenSettings: () => void
}

export function DashboardPage({ onOpenSettings }: DashboardPageProps) {
  const { t } = useTranslation('dashboard')
  const {
    savedRepos,
    openTabs,
    discoveredRepos,
    addRepo,
    openTab,
    addDiscoveredRepo
  } = useReposStore()

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
      // Scan directories up to depth 4
      const paths = await scanRepos(selected, 4)
      let addedCount = 0
      for (const repoPath of paths) {
        try {
          const name = repoPath.split('/').pop() || repoPath
          addDiscoveredRepo(repoPath, name)
          addedCount++
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
  const filterFn = (repo: { path: string; name: string }) => {
    if (!filterText) return true
    const text = filterText.toLowerCase()
    return repo.name.toLowerCase().includes(text) || repo.path.toLowerCase().includes(text)
  }

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
  }, [openTabs, savedRepos, filterText])

  // 2. Favorites repos (saved repos with pinned === true)
  const favoriteRepos = useMemo(() => {
    return savedRepos.filter((r) => r.pinned).filter(filterFn)
  }, [savedRepos, filterText])

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
  }, [discoveredRepos, savedRepos, filterText])

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
            <div className="flex h-[300px] flex-col items-center justify-center gap-4 text-muted-foreground bg-card/20 rounded-xl border border-dashed border-border/60 p-6 max-w-lg mx-auto mt-12 shadow-sm">
              <Folder className="h-12 w-12 opacity-30 text-primary" />
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

/* ============================================================================
   SUB-COMPONENT: RepoRow (Individual List Line)
   ============================================================================ */
function RepoRow({
  path,
  name,
  isSaved,
  isPinned,
  onToggleReadme,
  isReadmeActive
}: {
  path: string
  name: string
  isSaved: boolean
  isPinned: boolean
  onToggleReadme: () => void
  isReadmeActive: boolean
}) {
  const { t } = useTranslation('dashboard')
  const { togglePin, openTab, openTabs, closeTab } = useReposStore()
  const { settings } = useSettingsStore()

  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Fetch summary dynamically
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)

    getRepoSummary(path)
      .then((data) => {
        if (active) {
          setSummary(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('Failed to get summary for path: ' + path, err)
        if (active) {
          setError(true)
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [path])

  async function handleOpenEditor(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const editor = settings.git.externalEditor || 'vscode'
      const customCmd = settings.git.externalEditorCommand || ''
      await openInEditor(path, editor, customCmd)
    } catch (err) {
      console.error('Failed to launch editor:', err)
    }
  }

  function handleOpenTab(e: React.MouseEvent) {
    e.stopPropagation()
    openTab(path)
  }

  function handleCloseTab(e: React.MouseEvent) {
    e.stopPropagation()
    closeTab(path)
  }

  function handleTogglePin(e: React.MouseEvent) {
    e.stopPropagation()
    togglePin(path)
  }

  const editorName = useMemo(() => {
    const key = settings.git.externalEditor || 'vscode'
    switch (key) {
      case 'vscode':
        return 'VS Code'
      case 'cursor':
        return 'Cursor'
      case 'sublime':
        return 'Sublime Text'
      case 'intellij':
        return 'IntelliJ'
      default:
        return 'Éditeur personnalisé'
    }
  }, [settings.git.externalEditor])

  return (
    <div
      onClick={() => openTab(path)}
      className="group/row flex items-center justify-between px-4 py-3 hover:bg-accent/40 bg-transparent transition-all duration-150 cursor-pointer select-none border-b border-border/10 last:border-0 first:rounded-t-lg last:rounded-b-lg"
    >
      {/* Repo title & path */}
      <div className="flex items-center gap-2.5 min-w-0 pr-4 flex-1">
        {isSaved ? (
          <button
            onClick={handleTogglePin}
            className="text-muted-foreground/35 hover:text-amber-500 transition-colors duration-150 relative group/star shrink-0"
          >
            <Star className={`h-4 w-4 ${isPinned ? 'fill-amber-500 text-amber-500' : ''}`} />
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover/star:block bg-popover text-popover-foreground border border-border text-[9px] font-sans rounded px-1.5 py-0.5 whitespace-nowrap shadow-md z-50 pointer-events-none">
              {isPinned ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            </div>
          </button>
        ) : (
          <div className="h-4 w-4 shrink-0" />
        )}
        <div className="flex flex-col min-w-0">
          <span className="font-medium text-xs text-foreground group-hover/row:text-primary transition-colors truncate">
            {name}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-[320px]">
            {path}
          </span>
        </div>
      </div>

      {/* GIT STATUS COLUMNS */}
      <div className="flex items-center gap-4 shrink-0 mr-4 font-sans text-xs">
        {loading ? (
          <div className="flex items-center gap-1.5 text-muted-foreground/40">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span className="text-[10px] font-mono">Loading...</span>
          </div>
        ) : error ? (
          <span className="text-[10px] text-destructive/80 font-mono bg-destructive/10 border border-destructive/20 rounded px-1.5 py-0.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {t('dashboard.invalidRepo') || 'Invalide'}
          </span>
        ) : (
          <div className="flex items-center gap-3">
            {/* Branch info */}
            <div className="flex items-center gap-1 text-muted-foreground font-medium bg-muted/30 border border-border/30 rounded-md px-1.5 py-0.5 text-[10px] shrink-0 font-mono">
              <GitBranch className="h-3 w-3 shrink-0 text-primary/60" />
              <span className="truncate max-w-[80px]">{summary.head}</span>
            </div>

            {/* Changes details */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Conflicted */}
              {summary.conflictedCount > 0 && (
                <span
                  title={`${summary.conflictedCount} ${t('dashboard.conflictedChanges') || 'conflit(s)'}`}
                  className="bg-red-500/10 text-red-500 border border-red-500/25 rounded px-1.5 py-0.5 text-[10px] font-semibold animate-pulse leading-none font-mono"
                >
                  !{summary.conflictedCount}
                </span>
              )}

              {/* Staged */}
              {summary.stagedCount > 0 && (
                <span
                  title={`${summary.stagedCount} ${t('dashboard.stagedChanges') || 'staged'}`}
                  className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none font-mono"
                >
                  +{summary.stagedCount}
                </span>
              )}

              {/* Unstaged (Modified) */}
              {summary.unstagedCount > 0 && (
                <span
                  title={`${summary.unstagedCount} ${t('dashboard.unstagedChanges') || 'modified'}`}
                  className="bg-amber-500/10 text-amber-500 border border-amber-500/25 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none font-mono"
                >
                  ~{summary.unstagedCount}
                </span>
              )}

              {/* Untracked */}
              {summary.untrackedCount > 0 && (
                <span
                  title={`${summary.untrackedCount} ${t('dashboard.untrackedChanges') || 'untracked'}`}
                  className="bg-muted text-muted-foreground border border-border rounded px-1.5 py-0.5 text-[10px] font-medium leading-none font-mono"
                >
                  ?{summary.untrackedCount}
                </span>
              )}

              {/* Sync counts (Ahead/Behind vs upstream) */}
              {(summary.aheadCount > 0 || summary.behindCount > 0) && (
                <div className="flex items-center gap-1 bg-primary/5 text-primary border border-primary/10 rounded px-1.5 py-0.5 text-[10px] leading-none shrink-0 font-mono">
                  {summary.aheadCount > 0 && <span className="text-emerald-500 font-semibold">↑{summary.aheadCount}</span>}
                  {summary.behindCount > 0 && <span className="text-amber-500 font-semibold">↓{summary.behindCount}</span>}
                </div>
              )}

              {/* Clean repo status */}
              {summary.stagedCount === 0 &&
                summary.unstagedCount === 0 &&
                summary.untrackedCount === 0 &&
                summary.conflictedCount === 0 && (
                  <span title="Propre (Aucune modification)">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/80 shrink-0" />
                  </span>
                )}
            </div>
          </div>
        )}
      </div>

      {/* ACTIONS ON THE FAR RIGHT */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Open in Editor button */}
        {!error && (
          <div className="relative group/edit">
            <button
              onClick={handleOpenEditor}
              className="h-7 w-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/60 hover:border-border/80 transition-colors"
            >
              <Code className="h-3.5 w-3.5" />
            </button>
            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/edit:block bg-popover text-popover-foreground border border-border text-[9px] font-sans rounded px-1.5 py-0.5 whitespace-nowrap shadow-md z-50 pointer-events-none">
              {`${t('dashboard.openInEditor') || 'Ouvrir dans'} ${editorName}`}
            </div>
          </div>
        )}

        {/* README Details button */}
        {!error && (
          <div className="relative group/readme">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleReadme()
              }}
              className={`h-7 w-7 flex items-center justify-center rounded border transition-colors ${
                isReadmeActive
                  ? 'bg-primary/15 border-primary/40 text-primary hover:bg-primary/20'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/60 hover:border-border/80'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/readme:block bg-popover text-popover-foreground border border-border text-[9px] font-sans rounded px-1.5 py-0.5 whitespace-nowrap shadow-md z-50 pointer-events-none">
              {t('dashboard.showReadme') || 'Afficher le README'}
            </div>
          </div>
        )}

        {/* Add or Remove button (Open or Close Tab) */}
        {(() => {
          const isOpen = openTabs.includes(path)
          return (
            <div className="relative group/list-action">
              {isOpen ? (
                <button
                  onClick={handleCloseTab}
                  className="h-7 w-7 flex items-center justify-center rounded border border-border hover:border-red-500/30 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleOpenTab}
                  className="h-7 w-7 flex items-center justify-center rounded border border-border hover:border-primary/30 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/list-action:block bg-popover text-popover-foreground border border-border text-[9px] font-sans rounded px-1.5 py-0.5 whitespace-nowrap shadow-md z-50 pointer-events-none">
                {isOpen ? 'Fermer l\'onglet' : 'Ouvrir dans un onglet'}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

/* ============================================================================
   SUB-COMPONENT: ReadmePanel (Right-side Drawer for README)
   ============================================================================ */
function ReadmePanel({ path, onClose }: { path: string; onClose: () => void }) {
  const { t } = useTranslation('dashboard')
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    getRepoReadme(path)
      .then((data) => {
        setContent(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(String(err))
        setLoading(false)
      })
  }, [path])

  const name = path.split('/').pop() || path

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-card shadow-2xl min-w-0">
      {/* Pane Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-xs text-foreground truncate">{name}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Fermer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Pane content */}
      <div className="flex-1 overflow-y-auto p-5 select-text bg-card/10">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full py-8 space-y-2">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Chargement du README...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground/60 p-4">
            <FileText className="h-10 w-10 mb-2 opacity-20 text-muted-foreground" />
            <p className="text-xs font-sans">{t('dashboard.noReadme') || 'Aucun fichier README trouvé.'}</p>
          </div>
        ) : (
          <Markdown content={content} />
        )}
      </div>
    </div>
  )
}
