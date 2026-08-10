import { memo } from 'react'
import type { GitGraphNode, GitRef, WorktreeAgentActivity } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { useTagMenuHandler } from '../hooks/useTagMenuHandler'
import type { ResolvedColumn } from '../lib/columns.config'
import type { BisectRowStatus } from '../lib/bisectStatus'
import { getGraphColumnLayout, getMarkerPlacement } from '../lib/graphColumnSizing'
import { useSettingsStore } from '../../../stores/settings.store'
import type { ConflictRowInfo } from '../hooks/useGitGraphNodes'
import type { WorktreeWipStatus } from '../hooks/useWorktreeWipStatuses'
import type { WipRef } from './GraphMessageCells'
import { GraphCell } from './GraphCell'
import { GraphRowCell } from './GraphRowCell'
import { GraphRowBackdrop } from './GraphRowBackdrop'
import { worktreeWipPath } from '../lib/syntheticRows'

export { GraphAvatarTooltip } from './GraphAvatarTooltip'

interface GraphRowProps {
  node: GitGraphNode
  columns: ResolvedColumn[]
  isSelected: boolean
  isPrimary: boolean
  /** Left click (handles plain / Cmd+click / Shift+click through the event). */
  onSelect: (e: React.MouseEvent) => void
  /** Right click: opens the actions context menu. */
  onContextMenu: (e: React.MouseEvent) => void
  wipStats?: { added: number; modified: number; deleted: number }
  onCommitWip?: (message: string) => void
  isFirst?: boolean
  conflictInfo?: ConflictRowInfo | null
  /** True while a search is active and this row doesn't match it — mutes its text instead of
   * hiding the row, so the graph's shape stays intact while browsing results. */
  dimmed?: boolean
  /** Bisect annotation for this commit (good/bad/skip/under-test/first-bad), shown as a left-edge
   * colored dot while a `git bisect` session is running. */
  bisectStatus?: BisectRowStatus
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
  /** Largest column (lane) used by the whole graph — decides the graph column's display mode
   * (full / overflow / compact), shared by every row. */
  graphMaxColumn?: number
  /** Horizontal scroll offset of the graph column, shared by every row so the lanes stay aligned
   * (see `useGraphColumnScroll`). */
  graphScrollX?: number
  /** Tag short names the user keeps off the graph — their badge is dropped, the commit stays. */
  hiddenTags?: string[]
  /** Branches kept off the graph, on the same terms as the tags — `main` / `origin/main`. */
  hiddenBranches?: string[]
  /** True while this row is awaiting an inline tag name — its refs cell shows the name input
   * instead of the ref badges. Only ever set on a single row at a time. */
  isTagDraft?: boolean
  /** Confirm the inline tag name (only wired on the `isTagDraft` row). */
  onSubmitTag?: (name: string) => void
  /** Dismiss the inline tag input (only wired on the `isTagDraft` row). */
  onCancelTag?: () => void
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
  bisectStatus,
  worktreeWipStatuses,
  onOpenWorktree,
  worktreeAgentActivity,
  wipAgentActivity,
  wipRef,
  laneRef,
  graphMaxColumn = 0,
  graphScrollX = 0,
  hiddenTags,
  hiddenBranches,
  isTagDraft,
  onSubmitTag,
  onCancelTag,
}: GraphRowProps) {
  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight ?? 'small')
  const rowHeight = rowHeightSetting === 'small' ? 32 : 40
  const avatarSize = rowHeightSetting === 'small' ? 24 : 32
  const refsColumn = columns.find((c) => c.key === 'refs')
  // `refsWidth` is the x-offset at which the graph column begins within the row — i.e. the width of
  // everything to its left. `refs` is the only column before `graph` (see COLUMN_ORDER), so this is
  // its width when visible and 0 when it's hidden. Falling back to a non-zero default here would
  // shift the colored band/markers rightward by that amount once the refs column is toggled off.
  const refsWidth = refsColumn ? refsColumn.width : 0
  const graphColumn = columns.find((c) => c.key === 'graph')
  const graphWidth = graphColumn ? graphColumn.width : 120
  const layout = getGraphColumnLayout(graphWidth, graphMaxColumn, avatarSize, graphScrollX)
  const marker = getMarkerPlacement(node.column, layout, avatarSize)
  const isActiveRow = isSelected || isPrimary
  // Agent working in this row's worktree: the primary WIP row uses the active repo's activity;
  // a `WIP:<path>` row resolves it by path from the per-worktree list. Non-WIP rows have none.
  const oid = node.commit.oid
  const rowAgent =
    oid === 'WIP'
      ? wipAgentActivity
      : (() => {
          const path = worktreeWipPath(oid)
          return path ? worktreeAgentActivity?.find((a) => a.path === path) : undefined
        })()
  // Start the band at the row marker's vertical line (the avatar/point center), so the left half
  // of the marker stays clear. Marker center in row coords = refsWidth + 8px cell margin + x.
  // Once the column is scrolled, a band belonging to a marker pinned on the left keeps its tint —
  // it runs rightward, away from the zone — but is cut at the left zone's edge, so that zone reads
  // as its own gutter rather than as a lane's band.
  const startX = refsWidth + 8 + Math.max(marker.x, layout.leftOverlayEnd)
  const endX = refsWidth + graphWidth

  // A right-click that lands on a tag badge opens the tag menu instead of the commit menu. Detection
  // happens here, on the row, rather than on the badge itself: one handler covers the inline badge
  // AND the badges revealed in RefLabelGroup's portaled hover panel (portal events bubble through
  // the React tree, but `closest` on the DOM target still finds the badge's own marker). The badge
  // marks itself with `data-ref-tag="<shortName>"`; we resolve that back to the ref on the row.
  const onTagMenu = useTagMenuHandler()
  const handleContextMenu = (e: React.MouseEvent) => {
    if (onTagMenu) {
      const tagEl = (e.target as HTMLElement).closest?.('[data-ref-tag]')
      const tagName = tagEl?.getAttribute('data-ref-tag')
      if (tagName) {
        const tagRef = node.refs.find((r) => r.type === 'tag' && r.shortName === tagName)
        if (tagRef) {
          onTagMenu(e, tagRef)
          return
        }
      }
    }
    onContextMenu(e)
  }

  return (
    <div
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      className={cn(
        'group relative flex cursor-pointer items-center border-b border-transparent transition-colors select-none hover:z-graph-row-hover',
        rowHeight === 32 ? 'my-[4px] h-[24px]' : 'my-[4px] h-[32px]'
      )}
    >
      <GraphRowBackdrop
        color={node.color}
        startX={startX}
        endX={endX}
        isOverflowed={marker.overflowed}
        isActive={isActiveRow}
        isPrimary={isPrimary}
        isConflictRow={node.commit.oid === 'CONFLICT'}
        bisectStatus={bisectStatus}
      />

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
            <GraphRowCell
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
              hiddenTags={hiddenTags}
              hiddenBranches={hiddenBranches}
              isTagDraft={isTagDraft}
              onSubmitTag={onSubmitTag}
              onCancelTag={onCancelTag}
            />
          )}
        </div>
      ))}
    </div>
  )
})
