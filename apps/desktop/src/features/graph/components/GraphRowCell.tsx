import type { GitGraphNode, GitRef, WorktreeAgentActivity } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { ColumnKey } from '../lib/columns.config'
import { formatRelativeTimeCompact, formatExactDate } from '../../../lib/relativeDate'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useGitStashes } from '../../../hooks/useGitStashes'
import type { ConflictRowInfo } from '../hooks/useGitGraphNodes'
import type { WorktreeWipStatus } from '../hooks/useWorktreeWipStatuses'
import {
  WipCommitInput,
  WorktreeWipRow,
  ConflictRowMessage,
  type WipRef,
} from './GraphMessageCells'
import { isSyntheticRow, worktreeWipPath } from '../lib/syntheticRows'
import { AuthorAvatar } from './AuthorAvatar'
import { GraphRowRefsCell } from './GraphRowRefsCell'

interface GraphRowCellProps {
  /** Every column except `graph`, which {@link GraphCell} draws instead. */
  col: Exclude<ColumnKey, 'graph'>
  node: GitGraphNode
  /** Center x (cell-relative to the graph column) where this row's marker renders — the refs
   * connector line extends up to it, clamped or not (see `graphColumnSizing.ts`). */
  markerX: number
  wipStats?: { added: number; modified: number; deleted: number }
  wipRef?: WipRef
  onCommitWip?: (message: string) => void
  conflictInfo?: ConflictRowInfo | null
  dimmed?: boolean
  worktreeWipStatuses?: WorktreeWipStatus[]
  onOpenWorktree?: (path: string) => void
  isActive?: boolean
  laneRef?: GitRef
  /** AI agent working in this row's worktree (already resolved for WIP / WIP:<path> rows). */
  agentActivity?: WorktreeAgentActivity
  /** Tag short names the user keeps off the graph — their badge is dropped, the commit stays. */
  hiddenTags?: string[]
  /** Branches kept off the graph, on the same terms as the tags — `main` / `origin/main`. */
  hiddenBranches?: string[]
  isTagDraft?: boolean
  onSubmitTag?: (name: string) => void
  onCancelTag?: () => void
}

/**
 * What one column of one graph row draws.
 *
 * The three synthetic rows are handled here rather than by the row above, because what they replace
 * is a *cell*: a WIP row is an ordinary row whose message column is a commit box, and whose author,
 * date and sha columns are empty because it has no commit to describe. Keeping that in the row
 * itself would mean a second row component that happens to share a shell.
 */
export function GraphRowCell({
  col,
  node,
  markerX,
  wipStats,
  wipRef,
  onCommitWip,
  conflictInfo,
  dimmed,
  worktreeWipStatuses,
  onOpenWorktree,
  isActive,
  laneRef,
  agentActivity,
  hiddenTags,
  hiddenBranches,
  isTagDraft,
  onSubmitTag,
  onCancelTag,
}: GraphRowCellProps) {
  const { i18n } = useTranslation('git')
  const { commit } = node
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const { data: stashes } = useGitStashes(activeRepo)
  const isStashCommit = node.refs.some((r) => r.type === 'stash')
  const stash = isStashCommit ? stashes?.find((s) => s.commitOid === commit.oid) : null

  switch (col) {
    case 'refs':
      return (
        <GraphRowRefsCell
          node={node}
          markerX={markerX}
          isStashCommit={isStashCommit}
          laneRef={laneRef}
          hiddenTags={hiddenTags}
          hiddenBranches={hiddenBranches}
          isTagDraft={isTagDraft}
          onSubmitTag={onSubmitTag}
          onCancelTag={onCancelTag}
        />
      )

    case 'message': {
      if (node.commit.oid === 'WIP') {
        return (
          <WipCommitInput
            wipStats={wipStats ?? { added: 0, modified: 0, deleted: 0 }}
            refInfo={wipRef}
            onCommit={onCommitWip}
            agentActivity={agentActivity}
          />
        )
      }
      const path = worktreeWipPath(node.commit.oid)
      if (path !== null) {
        const wip = worktreeWipStatuses?.find((w) => w.path === path)
        return (
          <WorktreeWipRow
            wipStats={
              wip
                ? { added: wip.added, modified: wip.modified, deleted: wip.deleted }
                : { added: 0, modified: 0, deleted: 0 }
            }
            refInfo={wip ? { name: wip.branch, isWorktree: true } : undefined}
            onOpenWorktree={() => onOpenWorktree?.(path)}
            showOpenButton={isActive}
            agentActivity={agentActivity}
          />
        )
      }
      if (node.commit.oid === 'CONFLICT') {
        return (
          <ConflictRowMessage
            count={conflictInfo?.count ?? 0}
            branchName={conflictInfo?.branchName}
            currentStep={conflictInfo?.currentStep}
            totalSteps={conflictInfo?.totalSteps}
          />
        )
      }
      const body = commit.body?.replace(/\s+/g, ' ').trim()
      const displaySubject = stash ? stash.message : commit.subject
      const isFixup = displaySubject.startsWith('fixup!')
      return (
        <span
          className={cn('min-w-0 flex-1 truncate text-[11px] leading-tight', dimmed && 'italic')}
        >
          <span className={dimmed ? 'text-muted-foreground/40' : 'text-foreground'}>
            {isFixup ? (
              <>
                <span className={dimmed ? undefined : 'font-semibold text-orange-400'}>fixup!</span>
                {displaySubject.slice('fixup!'.length)}
              </>
            ) : (
              displaySubject
            )}
          </span>
          {body && (
            <span
              className={dimmed ? 'ml-2 text-muted-foreground/40' : 'ml-2 text-muted-foreground/70'}
            >
              {body}
            </span>
          )}
        </span>
      )
    }

    case 'author': {
      if (isSyntheticRow(node.commit.oid)) return null
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          <AuthorAvatar
            name={commit.author.name}
            email={commit.author.email}
            isStash={isStashCommit}
          />
          <span
            className={cn(
              'truncate text-[10px] text-muted-foreground',
              dimmed && 'text-muted-foreground/40 italic'
            )}
          >
            {commit.author.name}
          </span>
        </div>
      )
    }

    case 'date':
      if (isSyntheticRow(node.commit.oid)) return null
      return (
        <span
          className={cn(
            'truncate text-[10px] text-muted-foreground/70',
            dimmed && 'text-muted-foreground/40 italic'
          )}
          title={formatExactDate(commit.author.timestamp, i18n.language)}
        >
          {formatRelativeTimeCompact(commit.author.timestamp, i18n.language)}
        </span>
      )

    case 'sha':
      if (isSyntheticRow(node.commit.oid)) return null
      return (
        <code
          className={cn(
            'truncate font-mono text-[10px] text-muted-foreground',
            dimmed && 'text-muted-foreground/40 italic'
          )}
          title={commit.oid}
        >
          {commit.shortOid}
        </code>
      )
  }
}
