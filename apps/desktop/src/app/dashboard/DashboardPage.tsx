import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, Tooltip } from '@git-manager/ui'
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
  Clock,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { OctopusMascot } from '@git-manager/mascot'
import { CloneRepoDialog } from '../../components/tab-bar/CloneRepoDialog'
import { apiScanRepos } from '../../api/repo.api'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useDashboardStore } from '../../stores/dashboard.store'
import { useOpenRepository } from '../../hooks/useOpenRepository'
import { useMorningSummaries } from '../../hooks/useMorningSummaries'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiEnabled } from '../../hooks/useAiEnabled'
import { useDashboardSections } from './hooks/useDashboardSections'
import { RepoSection } from './components/RepoSection'
import { HiddenSectionsMenu } from './components/HiddenSectionsMenu'
import { ReadmePanel } from './components/ReadmePanel'
import { DailySummaryPanel } from './components/DailySummaryPanel'

interface DashboardPageProps {
  onOpenSettings: () => void
}

const SECTION_ICON = 'h-3.5 w-3.5'

export function DashboardPage({ onOpenSettings }: DashboardPageProps) {
  const { t } = useTranslation('dashboard')
  const addDiscoveredRepo = useRepoDataStore((s) => s.addDiscoveredRepo)
  const setAllSectionsCollapsed = useDashboardStore((s) => s.setAllSectionsCollapsed)
  const openRepository = useOpenRepository()

  const aiEnabled = useAiEnabled()
  // The daily summary is AI-generated, so the master AI switch gates it on top of its own toggle.
  const summaryEnabled =
    useSettingsStore((s) => s.settings.dailySummary?.enabled ?? true) && aiEnabled

  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [selectedReadmePath, setSelectedReadmePath] = useState<string | null>(null)
  const [selectedSummaryPath, setSelectedSummaryPath] = useState<string | null>(null)
  const [isCloneOpen, setIsCloneOpen] = useState(false)

  const sections = useDashboardSections(filterText)

  // The dashboard's right pane hosts either the README or the daily-summary briefing — opening one
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

  // Morning auto-briefing runs only for a bounded, relevant set — the repos open in tabs plus the
  // favorites — never every discovered repo. The hook itself no-ops when the feature is disabled.
  const morningCandidatePaths = useMemo(() => {
    const set = new Set<string>()
    sections.open.forEach((r) => set.add(r.path))
    sections.favorites.forEach((r) => set.add(r.path))
    return Array.from(set)
  }, [sections.open, sections.favorites])
  useMorningSummaries(morningCandidatePaths)

  const sectionTitles = {
    open: t('dashboard.openTabs'),
    favorites: t('dashboard.favorites'),
    recent: t('dashboard.recentRepos'),
    all: t('dashboard.allRepos'),
  }

  const sectionProps = {
    onToggleReadme: toggleReadme,
    selectedReadmePath,
    onToggleSummary: toggleSummary,
    selectedSummaryPath,
    summaryEnabled,
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* LEFT CONTAINER: Repo List Area */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-card/50 px-6 py-3.5 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 animate-pulse text-primary" />
            <h1 className="text-sm font-semibold tracking-wide text-foreground">
              {t('dashboard.title')}
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
              {t('dashboard.browse')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCloneOpen(true)}
              className="h-8 text-xs transition-all hover:border-primary/30 hover:bg-primary/10"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t('dashboard.clone')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleScanRepos}
              disabled={scanning}
              className="h-8 text-xs transition-all hover:border-primary/30 hover:bg-primary/10"
            >
              <FolderSearch className="mr-1.5 h-3.5 w-3.5" />
              {scanning ? t('dashboard.scanning') : t('dashboard.scanFolder')}
            </Button>
            <Tooltip content={t('dashboard.settings')}>
              <Button
                data-testid="dashboard-settings-button"
                size="sm"
                variant="ghost"
                onClick={onOpenSettings}
                aria-label={t('dashboard.settings')}
                className="h-8 w-8 hover:bg-accent"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        </header>

        {error && (
          <div className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-6 py-2.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {sections.totalKnownCount > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/10 px-6 py-3">
            <Button
              data-testid="dashboard-collapse-all"
              size="sm"
              variant="ghost"
              onClick={() => setAllSectionsCollapsed(true)}
              className="h-8 shrink-0 text-xs"
            >
              <ChevronsDownUp className="mr-1.5 h-3.5 w-3.5" />
              {t('dashboard.collapseAll')}
            </Button>
            <Button
              data-testid="dashboard-expand-all"
              size="sm"
              variant="ghost"
              onClick={() => setAllSectionsCollapsed(false)}
              className="h-8 shrink-0 text-xs"
            >
              <ChevronsUpDown className="mr-1.5 h-3.5 w-3.5" />
              {t('dashboard.expandAll')}
            </Button>
            <HiddenSectionsMenu titles={sectionTitles} />
            <div className="relative flex flex-1 items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t('dashboard.searchPlaceholder')}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="h-8 border-border bg-card pl-9 font-sans text-xs hover:border-border/80 focus-visible:ring-primary"
              />
              {filterText && (
                <button
                  type="button"
                  aria-label={t('dashboard.clearSearch')}
                  onClick={() => setFilterText('')}
                  className="absolute right-2.5 cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        <main className="flex-1 space-y-5 overflow-y-auto p-6">
          {sections.totalKnownCount === 0 ? (
            <div className="mx-auto mt-12 flex max-w-lg flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/60 bg-card/20 p-6 text-muted-foreground shadow-sm">
              <OctopusMascot size={150} label={t('dashboard.title')} />
              <p className="text-center text-xs leading-relaxed">{t('dashboard.noAllRepos')}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleOpenRepo}>
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  {t('dashboard.openRepo')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <RepoSection
                id="open"
                icon={<Terminal className={`${SECTION_ICON} text-primary/80`} />}
                title={sectionTitles.open}
                repos={sections.open}
                emptyLabel={t('dashboard.noTabs')}
                {...sectionProps}
              />
              <RepoSection
                id="favorites"
                icon={<Star className={`${SECTION_ICON} fill-amber-500 text-amber-500`} />}
                title={sectionTitles.favorites}
                repos={sections.favorites}
                emptyLabel={t('dashboard.noFavorites')}
                {...sectionProps}
              />
              <RepoSection
                id="recent"
                icon={<Clock className={`${SECTION_ICON} text-muted-foreground`} />}
                title={sectionTitles.recent}
                repos={sections.recent}
                emptyLabel={t('dashboard.noRecentRepos')}
                {...sectionProps}
              />
              <RepoSection
                id="all"
                icon={<Folder className={`${SECTION_ICON} text-muted-foreground`} />}
                title={sectionTitles.all}
                repos={sections.all}
                emptyLabel={t('dashboard.noAllRepos')}
                {...sectionProps}
              />
            </div>
          )}
        </main>
      </div>

      {/* RIGHT CONTAINER: README or Daily-summary panel (mutually exclusive) */}
      {selectedSummaryPath ? (
        <div className="animate-in slide-in-from-right flex h-full w-[450px] shrink-0 flex-col overflow-hidden border-l border-border bg-card/45 shadow-2xl backdrop-blur animate-duration-200">
          <DailySummaryPanel
            path={selectedSummaryPath}
            onClose={() => setSelectedSummaryPath(null)}
          />
        </div>
      ) : selectedReadmePath ? (
        <div className="animate-in slide-in-from-right flex h-full w-[450px] shrink-0 flex-col overflow-hidden border-l border-border bg-card/45 shadow-2xl backdrop-blur animate-duration-200">
          <ReadmePanel path={selectedReadmePath} onClose={() => setSelectedReadmePath(null)} />
        </div>
      ) : null}

      <CloneRepoDialog open={isCloneOpen} onOpenChange={setIsCloneOpen} />
    </div>
  )
}
