import { FolderGit2, GitBranch, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { PRRowSkeleton } from './RowSkeletons'
import { useLocalWipRepos, type LocalWipRepo } from '../../../hooks/useLocalWipRepos'
import { useRepoUIStore } from '../../../stores/repoUI.store'

function WipRepoRow({ repo }: { repo: LocalWipRepo }) {
  const { t } = useTranslation('launchpad')
  const openTab = useRepoUIStore((s) => s.openTab)

  return (
    <div
      className="group/wip flex cursor-pointer items-center gap-3 border-b border-border/30 px-4 py-2.5 transition-colors last:border-0 hover:bg-accent/30"
      onClick={() => openTab(repo.path)}
      data-testid={`wip-repo-${repo.path}`}
    >
      <FolderGit2 className="h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium text-foreground transition-colors group-hover/wip:text-primary">
            {repo.name}
          </span>
          {repo.head && (
            <span className="flex shrink-0 items-center gap-0.5 font-mono text-[10px] text-muted-foreground/60">
              <GitBranch className="h-2.5 w-2.5" /> {repo.head}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px]">
          <span className="text-green-400">+{repo.added}</span>
          <span className="text-blue-400">~{repo.modified}</span>
          <span className="text-red-400">−{repo.deleted}</span>
          {repo.conflicted > 0 && (
            <span className="flex items-center gap-0.5 text-amber-400">
              <AlertTriangle className="h-2.5 w-2.5" />
              {t('wip.conflicts', { count: repo.conflicted })}
            </span>
          )}
          <span className="text-muted-foreground/40">
            · {t('wip.changes', { count: repo.totalChanges })}
          </span>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation()
          openTab(repo.path)
        }}
        data-testid={`wip-open-${repo.path}`}
      >
        {t('wip.openRepo')}
      </Button>
    </div>
  )
}

/** The WIP tab: uncommitted local work across every saved repo, so unfinished changes are visible
 * next to remote PRs. Clicking a row opens that repo's tab. */
export function WipTab() {
  const { t } = useTranslation('launchpad')
  const { wipRepos, loading } = useLocalWipRepos()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <PRRowSkeleton />
            <PRRowSkeleton />
          </>
        ) : wipRepos.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5">
              <FolderGit2 className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">{t('wip.emptyTitle')}</h3>
            <p className="max-w-[280px] text-xs text-muted-foreground">{t('wip.emptyDesc')}</p>
          </div>
        ) : (
          wipRepos.map((repo) => <WipRepoRow key={repo.path} repo={repo} />)
        )}
      </div>
    </div>
  )
}
