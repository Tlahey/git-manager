import { useState, useMemo } from 'react'
import { Plus, Trash2, BookOpen, GitPullRequest } from 'lucide-react'
import { Button } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { EmptyState, NoResults } from '@git-manager/components'
import { Toolbar } from './Toolbar'
import { TableHeader, LoadMore } from './ListHelpers'
import { usePRSort } from '../hooks/listHooks'
import { useListToolbar } from '../hooks/useListToolbar'
import { PRRowSkeleton } from './RowSkeletons'
import { PRRow } from './PRRow'
import { FollowPRDialog } from './FollowPRDialog'
import { matchesPrSearch } from '../lib/prSearch'
import type { MockPR } from '../../../lib/github/types'

const PAGE_SIZE = 20

function parseFollowedPR(url: string): MockPR | null {
  const match = url.match(/\/pull\/(\d+)$/)
  if (!match) return null
  const repoMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\//)
  const repo = repoMatch ? repoMatch[2] : 'unknown'
  return {
    id: `followed-${url}`,
    number: parseInt(match[1]),
    title: `PR #${match[1]} — ${repo}`,
    repo,
    repoUrl: url.split('/pull/')[0],
    url,
    status: 'open',
    ciStatus: null,
    author: '—',
    // Nothing in the URL says who wrote it, so there is no avatar — not a stand-in one. The row
    // renders the author's initials instead (`PRRow`), which is honest about what is unknown;
    // `avatars.githubusercontent.com/u/1` used to sit here, and that is a real person's face.
    authorAvatar: '',
    collaborators: [],
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewStatus: 'pending',
    isDraft: false,
    isFollowed: true,
    labels: [],
    comments: 0,
  }
}

interface FollowedPRsTabProps {
  followedPRs: MockPR[]
  pinnedIds: Set<string>
  onTogglePin: (id: string) => void
  onAddFollowed: (pr: MockPR) => void
  onRemoveFollowed: (id: string) => void
  loading: boolean
}

export function FollowedPRsTab({
  followedPRs,
  pinnedIds,
  onTogglePin,
  onAddFollowed,
  onRemoveFollowed,
  loading,
}: FollowedPRsTabProps) {
  const { t } = useTranslation('launchpad')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [showFollowDialog, setShowFollowDialog] = useState(false)

  const repos = useMemo(() => [...new Set(followedPRs.map((p) => p.repo))].sort(), [followedPRs])
  const statuses = useMemo(
    () => [...new Set(followedPRs.map((p) => p.status))].sort(),
    [followedPRs]
  )
  const authors = useMemo(
    () => [...new Set(followedPRs.map((p) => p.author))].sort(),
    [followedPRs]
  )

  const {
    search,
    globalSearch,
    sortKey,
    sortDir,
    statusFilter,
    repoFilter,
    authorFilter,
    toolbarProps,
  } = useListToolbar({ repos, statuses, authors })

  const filtered = useMemo(() => {
    return followedPRs.filter((pr) => {
      if (statusFilter.size > 0 && !statusFilter.has(pr.status)) return false
      if (repoFilter.size > 0 && !repoFilter.has(pr.repo)) return false
      if (authorFilter.size > 0 && !authorFilter.has(pr.author)) return false
      return matchesPrSearch(pr, search) && matchesPrSearch(pr, globalSearch)
    })
  }, [followedPRs, search, globalSearch, statusFilter, repoFilter, authorFilter])

  const sortedPRs = usePRSort(filtered, sortKey, sortDir)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Toolbar {...toolbarProps}>
        <Button
          size="sm"
          data-testid="launchpad-follow-pr-button"
          onClick={() => setShowFollowDialog(true)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> {t('followDialog.follow')}
        </Button>
      </Toolbar>

      <TableHeader />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <>
            <PRRowSkeleton />
            <PRRowSkeleton />
            <PRRowSkeleton />
          </>
        ) : followedPRs.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6 text-primary" />}
            title={t('followed.emptyTitle')}
            description={t('followed.emptyDesc')}
            action={
              <Button
                size="sm"
                onClick={() => setShowFollowDialog(true)}
                className="gap-1.5 rounded-lg"
              >
                <Plus className="h-3.5 w-3.5" /> {t('followed.addByUrl')}
              </Button>
            }
          />
        ) : sortedPRs.length === 0 ? (
          <NoResults
            icon={<GitPullRequest className="h-6 w-6 opacity-30" />}
            message={t('followed.noMatch')}
          />
        ) : (
          <>
            {sortedPRs.slice(0, shown).map((pr) => (
              <div key={pr.id} className="group/followed relative">
                <PRRow pr={pr} pinned={pinnedIds.has(pr.id)} onTogglePin={onTogglePin} />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveFollowed(pr.id)
                  }}
                  className="absolute top-1/2 right-10 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border border-border bg-card/85 text-muted-foreground opacity-0 shadow-xs backdrop-blur-xs transition-all duration-150 group-hover/followed:opacity-100 hover:border-destructive/20 hover:text-destructive"
                  title={t('followed.unfollow')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <LoadMore
              total={sortedPRs.length}
              shown={shown}
              onLoadMore={() => setShown((n) => n + PAGE_SIZE)}
            />
          </>
        )}
      </div>

      {showFollowDialog && (
        <FollowPRDialog
          onAdd={(url) => {
            const pr = parseFollowedPR(url)
            if (pr) onAddFollowed(pr)
          }}
          onClose={() => setShowFollowDialog(false)}
        />
      )}
    </div>
  )
}
