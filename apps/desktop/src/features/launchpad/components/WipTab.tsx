import { useMemo } from 'react'
import { FolderGit2, GitBranch, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { EmptyState, NoResults } from '@git-manager/components'
import { Button, Tag } from '@git-manager/ui'
import { Toolbar } from './Toolbar'
import { useListToolbar } from '../hooks/useListToolbar'
import { PRRowSkeleton } from './RowSkeletons'
import { useLocalWipRepos, type LocalWipEntry } from '../hooks/useLocalWipRepos'
import { useOpenRepoTab } from '../../../hooks/useOpenRepoTab'

function WipEntryRow({ entry }: { entry: LocalWipEntry }) {
  const { t } = useTranslation('launchpad')
  const openTab = useOpenRepoTab()
  // "WIP on <repository>" for the primary worktree, "WIP on <branch>" for a linked branch worktree.
  const label = entry.isMainWorktree ? entry.repoName : entry.branch

  return (
    <div
      className="group/wip flex cursor-pointer items-center gap-3 border-b border-border/30 px-4 py-2.5 transition-colors last:border-0 hover:bg-accent/30"
      onClick={() => openTab(entry.worktreePath)}
      data-testid={`wip-entry-${entry.worktreePath}`}
    >
      <FolderGit2 className="h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground transition-colors group-hover/wip:text-primary">
          {t('wip.on', { name: label })}
        </span>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <Tag tone="warning" className="shrink-0">
            WIP
          </Tag>
          {entry.added > 0 && (
            <Tag tone="success" className="font-mono">
              +{entry.added}
            </Tag>
          )}
          {entry.modified > 0 && (
            <Tag tone="info" className="font-mono">
              ~{entry.modified}
            </Tag>
          )}
          {entry.deleted > 0 && (
            <Tag tone="danger" className="font-mono">
              −{entry.deleted}
            </Tag>
          )}
          {entry.conflicted > 0 && (
            <Tag tone="warning" className="gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" />
              {t('wip.conflicts', { count: entry.conflicted })}
            </Tag>
          )}
          <span className="text-[10px] text-muted-foreground/40">
            {t('wip.changes', { count: entry.totalChanges })}
          </span>
        </div>
      </div>
      <div className="w-[130px] shrink-0">
        <span className="block truncate font-mono text-[10px] text-muted-foreground/70">
          {entry.repoName}
        </span>
        <span
          className="mt-0.5 flex w-fit max-w-full items-center gap-0.5 rounded border border-border/50 bg-muted/60 px-1 py-px text-[9px] text-muted-foreground"
          title={entry.branch}
        >
          <GitBranch className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate font-mono">{entry.branch}</span>
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation()
          openTab(entry.worktreePath)
        }}
        data-testid={`wip-open-${entry.worktreePath}`}
      >
        {t('wip.openRepo')}
      </Button>
    </div>
  )
}

/** The WIP tab: uncommitted local work across every saved repo and each of its worktrees, so
 * unfinished changes are visible next to remote PRs. Each row is one dirty worktree — clicking it
 * opens that worktree's tab. Shares the PR tabs' toolbar; only name search, repo filter and repo/
 * files sort are meaningful (these rows are local worktrees, not PRs), so status/author are empty. */
export function WipTab() {
  const { t } = useTranslation('launchpad')
  const { entries, loading } = useLocalWipRepos()

  const repos = useMemo(() => [...new Set(entries.map((e) => e.repoName))].sort(), [entries])

  const { search, sortKey, sortDir, repoFilter, toolbarProps } = useListToolbar({
    initialSortKey: 'files',
    repos,
    statuses: [],
    authors: [],
  })

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (repoFilter.size > 0 && !repoFilter.has(e.repoName)) return false
        if (search) {
          const q = search.toLowerCase()
          return e.repoName.toLowerCase().includes(q) || e.branch.toLowerCase().includes(q)
        }
        return true
      }),
    [entries, search, repoFilter]
  )

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      // Only 'files' (change count) and repo/name are meaningful for local worktrees; the other PR
      // sort keys fall back to repo name + branch so the control still behaves predictably.
      const cmp =
        sortKey === 'files'
          ? a.totalChanges - b.totalChanges
          : `${a.repoName}/${a.branch}`.localeCompare(`${b.repoName}/${b.branch}`)
      return sortDir === 'desc' ? -cmp : cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Toolbar {...toolbarProps} />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <PRRowSkeleton />
            <PRRowSkeleton />
          </>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<FolderGit2 className="h-6 w-6 text-primary" />}
            title={t('wip.emptyTitle')}
            description={t('wip.emptyDesc')}
          />
        ) : sorted.length === 0 ? (
          <NoResults
            icon={<FolderGit2 className="h-6 w-6 opacity-30" />}
            message={t('wip.noMatch')}
          />
        ) : (
          sorted.map((entry) => <WipEntryRow key={entry.worktreePath} entry={entry} />)
        )}
      </div>
    </div>
  )
}
