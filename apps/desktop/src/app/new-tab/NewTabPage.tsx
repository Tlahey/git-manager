import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Card } from '@git-manager/ui'
import { FolderOpen, Download, FolderPlus, GitMerge, AlertTriangle, Clock } from 'lucide-react'
import { pickFolder } from '../../lib/pickFolder'
import { CloneRepoDialog } from '../../components/tab-bar/CloneRepoDialog'
import { apiInitRepo } from '../../api/repo.api'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useOpenRepository } from '../../hooks/useOpenRepository'
import { useOpenRepoTab } from '../../hooks/useOpenRepoTab'
import { useRecentRepos } from '../../hooks/useRecentRepos'
import { RecentRepoRow } from './components/RecentRepoRow'

/**
 * The landing page of an empty "New Tab" (⌘T / Ctrl+T): the three ways into a repository plus the
 * recently opened ones. Picking a repo replaces this placeholder tab with it — or, when that repo
 * is already open, focuses its existing tab and closes this one (see `openTab` in `repoUI.store`).
 */
export function NewTabPage() {
  const { t } = useTranslation('common')
  const addRepo = useRepoDataStore((s) => s.addRepo)
  const openTabs = useRepoUIStore((s) => s.openTabs)
  const openRepository = useOpenRepository()
  const openRepoTab = useOpenRepoTab()
  const recentRepos = useRecentRepos()

  const [error, setError] = useState<string | null>(null)
  const [isCloneOpen, setIsCloneOpen] = useState(false)

  async function handleOpen() {
    setError(null)
    try {
      await openRepository()
    } catch (err) {
      setError(String(err))
    }
  }

  async function handleCreate() {
    setError(null)
    try {
      const selected = await pickFolder()
      if (!selected) return
      const repo = await apiInitRepo(selected)
      addRepo(repo)
      openRepoTab(repo.path)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <div
      data-testid="new-tab-page"
      className="flex h-full w-full flex-col overflow-hidden bg-background"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/50 px-6 py-3.5 backdrop-blur-xs">
        <GitMerge className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold tracking-wide text-foreground">{t('newTab.title')}</h1>
      </header>

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-6 py-2.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="new-tab-open-button"
              size="sm"
              variant="outline"
              onClick={handleOpen}
              className="h-8 text-xs"
            >
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              {t('newTab.open')}
            </Button>
            <Button
              data-testid="new-tab-clone-button"
              size="sm"
              variant="outline"
              onClick={() => setIsCloneOpen(true)}
              className="h-8 text-xs"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t('newTab.clone')}
            </Button>
            <Button
              data-testid="new-tab-create-button"
              size="sm"
              variant="outline"
              onClick={handleCreate}
              className="h-8 text-xs"
            >
              <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
              {t('newTab.create')}
            </Button>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 border-b border-border/40 pb-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold tracking-wider text-foreground uppercase">
                {t('newTab.recent')}
              </h2>
              <span className="rounded-full bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                {recentRepos.length}
              </span>
            </div>
            {recentRepos.length === 0 ? (
              <p className="py-1 pl-5 text-[11px] text-muted-foreground/60 italic">
                {t('newTab.noRecent')}
              </p>
            ) : (
              <Card className="bg-card/30 shadow-xs">
                {recentRepos.map((repo) => (
                  <RecentRepoRow
                    key={repo.path}
                    path={repo.path}
                    name={repo.name}
                    isOpen={openTabs.includes(repo.path)}
                    onSelect={() => openRepoTab(repo.path)}
                  />
                ))}
              </Card>
            )}
          </div>
        </div>
      </main>

      <CloneRepoDialog open={isCloneOpen} onOpenChange={setIsCloneOpen} />
    </div>
  )
}
