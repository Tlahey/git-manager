import { memo } from 'react'
import type { GitGraphNode, GitRef, WorktreeAgentActivity } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { RefLabel } from './RefLabel'
import { RefLabelGroup } from './RefLabelGroup'
import type { ColumnKey, ResolvedColumn } from './columns.config'
import { getGraphColumnLayout, getMarkerPlacement } from './graphColumnSizing'
import {
  REF_CONNECTOR_LINE_OPACITY_HEX,
  BAND_ALPHA_HEX,
  BAND_ALPHA_SELECTED_HEX,
} from './graphLayout'
import { formatRelativeDate, formatExactDate } from '../../lib/relativeDate'
import { useSettingsStore } from '../../stores/settings.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useGitStashes } from '../../hooks/useGitStashes'
import type { ConflictRowInfo } from '../../hooks/useGitGraphNodes'
import type { WorktreeWipStatus } from '../../hooks/useWorktreeWipStatuses'
import {
  WipCommitInput,
  WorktreeWipRow,
  ConflictRowMessage,
  type WipRef,
} from './components/GraphMessageCells'
import { GraphCell, isWipRow } from './components/GraphCell'
import { AuthorAvatar } from './components/AuthorAvatar'

export { GraphAvatarTooltip } from './components/GraphAvatarTooltip'

interface GraphRowProps {
  node: GitGraphNode
  columns: ResolvedColumn[]
  isSelected: boolean
  isPrimary: boolean
  /** Clic gauche (gère simple / Cmd+clic / Shift+clic via l'event). */
  onSelect: (e: React.MouseEvent) => void
  /** Clic droit : ouvre le menu contextuel d'actions. */
  onContextMenu: (e: React.MouseEvent) => void
  wipStats?: { added: number; modified: number; deleted: number }
  onCommitWip?: (message: string) => void
  isFirst?: boolean
  conflictInfo?: ConflictRowInfo | null
  /** True while a search is active and this row doesn't match it — mutes its text instead of
   * hiding the row, so the graph's shape stays intact while browsing results. */
  dimmed?: boolean
  /** WIP status of every other linked worktree — used to resolve the file-count badge for a
   * `WIP:<path>` synthetic row (its `commit.oid` carries the worktree path). */
  worktreeWipStatuses?: WorktreeWipStatus[]
  onOpenWorktree?: (path: string) => void
  /** AI-agent activity for every linked worktree — resolved (by path) to the agent working in a
   * `WIP:<path>` row's worktree. */
  worktreeAgentActivity?: WorktreeAgentActivity[]
  /** AI-agent activity for the active repo/worktree — attached to the primary `WIP` row. */
  wipAgentActivity?: WorktreeAgentActivity
  /** Branch (or worktree) the active repo's primary "// WIP" row is on — shown as a tag. */
  wipRef?: WipRef
  /** Branch owning this row's colored lane. Shown faintly, on hover only, in the refs column of a
   * commit that carries no ref badge of its own — hints which branch the commit sits on. */
  laneRef?: GitRef
  /** Plus grande colonne (lane) utilisée par le graphe entier — détermine le mode d'affichage
   * de la colonne graph (full / overflow / compact) partagé par toutes les lignes. */
  graphMaxColumn?: number
}

// ── Cellules ──────────────────────────────────────────────────────────────────

function CellContent({
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
}: {
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
}) {
  const { commit } = node
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const { data: stashes } = useGitStashes(activeRepo)
  const isStashCommit = node.refs.some((r) => r.type === 'stash')
  const stash = isStashCommit ? stashes?.find((s) => s.commitOid === commit.oid) : null

  switch (col) {
    case 'refs': {
      if (isStashCommit) return null
      const filteredRefs = node.refs
      if (filteredRefs.length === 0) {
        // No ref badge of its own: on hover, faintly hint the branch owning this commit's lane.
        // Never on the synthetic WIP / conflict rows.
        const isRealCommit = !isWipRow(commit.oid) && commit.oid !== 'CONFLICT'
        if (!isRealCommit || !laneRef) return null
        return (
          <div
            className="pointer-events-none flex h-full w-full min-w-0 items-center overflow-hidden opacity-0 transition-opacity duration-150 group-hover:opacity-40"
            data-testid="lane-branch-hint"
          >
            <RefLabel gitRef={laneRef} color={node.color} interactive={false} />
          </div>
        )
      }
      // Only the LOCAL main/master branch's row draws a solid, full-color connector — its mainline
      // reads as the repo's primary line. Every other ref (origin/main included) gets the faint
      // connector like the rest.
      const hasLocalMain = filteredRefs.some(
        (r) => r.type === 'branch' && (r.shortName === 'main' || r.shortName === 'master')
      )
      return (
        <div className="flex h-full w-full min-w-0 items-center overflow-visible">
          <RefLabelGroup refs={filteredRefs} color={node.color} />
          <div
            className="pointer-events-none ml-2 h-[2px] flex-1 transition-colors"
            style={{
              backgroundColor: hasLocalMain
                ? node.color
                : `${node.color}${REF_CONNECTOR_LINE_OPACITY_HEX}`,
              marginRight: `-${markerX + 15}px`,
            }}
          />
        </div>
      )
    }

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
      if (node.commit.oid.startsWith('WIP:')) {
        const path = node.commit.oid.slice('WIP:'.length)
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
      if (isWipRow(node.commit.oid) || node.commit.oid === 'CONFLICT') return null
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
              dimmed && 'italic text-muted-foreground/40'
            )}
          >
            {commit.author.name}
          </span>
        </div>
      )
    }

    case 'date':
      if (isWipRow(node.commit.oid) || node.commit.oid === 'CONFLICT') return null
      return (
        <span
          className={cn(
            'truncate text-[10px] text-muted-foreground/70',
            dimmed && 'italic text-muted-foreground/40'
          )}
          title={formatExactDate(commit.author.timestamp)}
        >
          {formatRelativeDate(commit.author.timestamp)}
        </span>
      )

    case 'sha':
      if (isWipRow(node.commit.oid) || node.commit.oid === 'CONFLICT') return null
      return (
        <code
          className={cn(
            'truncate font-mono text-[10px] text-muted-foreground',
            dimmed && 'italic text-muted-foreground/40'
          )}
          title={commit.oid}
        >
          {commit.shortOid}
        </code>
      )
  }
}

// ── GraphRow ──────────────────────────────────────────────────────────────────

export const GraphRow = memo(function GraphRow({
  node,
  columns,
  isSelected,
  isPrimary,
  onSelect,
  onContextMenu,
  wipStats,
  onCommitWip,
  isFirst,
  conflictInfo,
  dimmed,
  worktreeWipStatuses,
  onOpenWorktree,
  worktreeAgentActivity,
  wipAgentActivity,
  wipRef,
  laneRef,
  graphMaxColumn = 0,
}: GraphRowProps) {
  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight || 'standard')
  const rowHeight = rowHeightSetting === 'small' ? 32 : 40
  const avatarSize = rowHeightSetting === 'small' ? 24 : 32
  const refsColumn = columns.find((c) => c.key === 'refs')
  const refsWidth = refsColumn ? refsColumn.width : 160
  const graphColumn = columns.find((c) => c.key === 'graph')
  const graphWidth = graphColumn ? graphColumn.width : 120
  const layout = getGraphColumnLayout(graphWidth, graphMaxColumn, avatarSize)
  const marker = getMarkerPlacement(node.column, layout, avatarSize)
  const isActiveRow = isSelected || isPrimary
  // Agent working in this row's worktree: the primary WIP row uses the active repo's activity;
  // a `WIP:<path>` row resolves it by path from the per-worktree list. Non-WIP rows have none.
  const oid = node.commit.oid
  const rowAgent =
    oid === 'WIP'
      ? wipAgentActivity
      : oid.startsWith('WIP:')
        ? worktreeAgentActivity?.find((a) => a.path === oid.slice('WIP:'.length))
        : undefined
  // Start the band at the row marker's vertical line (the avatar/point center), so the left half
  // of the marker stays clear. Marker center in row coords = refsWidth + 8px cell margin + x.
  const startX = refsWidth + 8 + marker.x
  const endX = refsWidth + graphWidth

  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(
        'group relative flex cursor-pointer select-none items-center border-b border-transparent transition-colors hover:z-graph-row-hover',
        rowHeight === 32 ? 'my-[4px] h-[24px]' : 'my-[4px] h-[32px]'
      )}
    >
      {/* Background colored band starting from the avatar to the right boundary of the graph column, with border-right */}
      <div
        className="pointer-events-none absolute inset-y-0 border-r-[3px] transition-colors"
        style={{
          left: startX,
          width: Math.max(0, endX - startX),
          // The band of a marker pulled into the overflow zone would live entirely under the fade
          // zone — drop its tint (the colored border-right on the far edge stays), unless the row
          // is selected: the vivid selection tint stays visible even under the zone.
          backgroundColor:
            marker.overflowed && !isActiveRow
              ? 'transparent'
              : `${node.color}${isActiveRow ? BAND_ALPHA_SELECTED_HEX : BAND_ALPHA_HEX}`,
          borderRightColor: node.color,
        }}
      />

      {/* Selection background starting from the end of the graph column to the right end of the row */}
      {isActiveRow && (
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 transition-colors',
            isPrimary ? 'bg-accent' : 'bg-accent/70'
          )}
          style={{
            left: endX,
            right: 0,
          }}
        />
      )}

      {/* Hover background starting from the end of the graph column to the right end of the row */}
      <div
        className="pointer-events-none absolute inset-y-0 bg-accent/50 opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          left: endX,
          right: 0,
        }}
      />

      {/* Conflict background starting from the end of the graph column to the right end of the row */}
      {node.commit.oid === 'CONFLICT' && (
        <div
          className="pointer-events-none absolute inset-y-0"
          style={{
            left: endX,
            right: 0,
            backgroundColor: '#904538',
          }}
        />
      )}

      {columns.map((col) => (
        <div
          key={col.key}
          className={cn(
            'relative z-content flex h-full min-w-0 items-center',
            col.key === 'refs' ? 'justify-start pl-2' : 'mx-2',
            col.key === 'graph' && 'px-0'
          )}
          style={
            col.flex
              ? { flex: '1 1 0%', minWidth: col.minWidth }
              : { width: col.width, flexShrink: 0 }
          }
        >
          {col.key === 'graph' ? (
            <GraphCell
              node={node}
              refsWidth={refsWidth}
              graphWidth={graphWidth}
              layout={layout}
              marker={marker}
              avatarSize={avatarSize}
              isFirst={isFirst}
              agentActivity={rowAgent}
            />
          ) : (
            <CellContent
              col={col.key}
              node={node}
              markerX={marker.x}
              wipStats={wipStats}
              wipRef={wipRef}
              onCommitWip={onCommitWip}
              conflictInfo={conflictInfo}
              dimmed={dimmed}
              worktreeWipStatuses={worktreeWipStatuses}
              onOpenWorktree={onOpenWorktree}
              isActive={isActiveRow}
              laneRef={laneRef}
              agentActivity={rowAgent}
            />
          )}
        </div>
      ))}

    </div>
  )
})
