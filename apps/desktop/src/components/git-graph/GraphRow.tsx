import { memo } from 'react'
import type { GitGraphNode, GitRef, WorktreeAgentActivity } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { RefLabel } from './RefLabel'
import { RefLabelGroup } from './RefLabelGroup'
import { TagCreationInput } from './TagCreationInput'
import { useTagMenuHandler } from './TagMenuContext'
import type { ColumnKey, ResolvedColumn } from './columns.config'
import type { BisectRowStatus } from './bisectStatus'
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
  /** Plus grande colonne (lane) utilisée par le graphe entier — détermine le mode d'affichage
   * de la colonne graph (full / overflow / compact) partagé par toutes les lignes. */
  graphMaxColumn?: number
  /** True while this row is awaiting an inline tag name — its refs cell shows the name input
   * instead of the ref badges. Only ever set on a single row at a time. */
  isTagDraft?: boolean
  /** Confirm the inline tag name (only wired on the `isTagDraft` row). */
  onSubmitTag?: (name: string) => void
  /** Dismiss the inline tag input (only wired on the `isTagDraft` row). */
  onCancelTag?: () => void
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
  isTagDraft,
  onSubmitTag,
  onCancelTag,
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
  isTagDraft?: boolean
  onSubmitTag?: (name: string) => void
  onCancelTag?: () => void
}) {
  const { commit } = node
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const { data: stashes } = useGitStashes(activeRepo)
  const isStashCommit = node.refs.some((r) => r.type === 'stash')
  const stash = isStashCommit ? stashes?.find((s) => s.commitOid === commit.oid) : null

  switch (col) {
    case 'refs': {
      if (isTagDraft && onSubmitTag && onCancelTag) {
        return (
          <div className="flex h-full w-full min-w-0 items-center">
            <TagCreationInput variant="inline" onSubmit={onSubmitTag} onCancel={onCancelTag} />
          </div>
        )
      }
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

/** Left-stripe color per bisect status. */
const BISECT_STRIPE: Record<BisectRowStatus, string> = {
  firstBad: 'bg-red-600',
  current: 'bg-amber-500',
  bad: 'bg-red-500',
  good: 'bg-green-500',
  skip: 'bg-muted-foreground',
}

/** Full-row background tint per bisect status, so a marked commit reads at a glance. */
const BISECT_ROW_BG: Record<BisectRowStatus, string> = {
  firstBad: 'bg-red-500/15',
  current: 'bg-amber-500/15',
  bad: 'bg-red-500/10',
  good: 'bg-green-500/10',
  skip: 'bg-muted-foreground/10',
}

/** i18n key (git namespace) for each bisect status, used as the stripe's accessible label. */
const BISECT_LABEL: Record<BisectRowStatus, string> = {
  firstBad: 'bisect.status.firstBad',
  current: 'bisect.status.current',
  bad: 'bisect.status.bad',
  good: 'bisect.status.good',
  skip: 'bisect.status.skip',
}

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
  isTagDraft,
  onSubmitTag,
  onCancelTag,
}: GraphRowProps) {
  const { t } = useTranslation('git')
  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight || 'standard')
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
        'group relative flex cursor-pointer select-none items-center border-b border-transparent transition-colors hover:z-graph-row-hover',
        rowHeight === 32 ? 'my-[4px] h-[24px]' : 'my-[4px] h-[32px]'
      )}
    >
      {bisectStatus && (
        <>
          <span
            aria-hidden
            className={cn('pointer-events-none absolute inset-0', BISECT_ROW_BG[bisectStatus])}
          />
          <span
            data-testid="bisect-row-marker"
            aria-label={t(BISECT_LABEL[bisectStatus])}
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 z-graph-row-hover w-[3px] rounded-r',
              BISECT_STRIPE[bisectStatus]
            )}
          />
        </>
      )}

      {/* Background colored band starting from the avatar to the right boundary of the graph column, with border-right */}
      <div
        data-testid="graph-row-band"
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

      {/* Selection background starting from the end of the graph column to the right end of the row.
          A light tint of the theme's primary (purple in the default theme) reads more clearly as a
          selection than the neutral accent, while staying theme-aware and contrast-safe. */}
      {isActiveRow && (
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 transition-colors',
            isPrimary ? 'bg-primary/20' : 'bg-primary/10'
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
