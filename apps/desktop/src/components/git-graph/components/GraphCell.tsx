// Content of a row's `graph` column: connection lines (GraphSvg) + the commit's marker (avatar /
// dot / WIP ring). Extracted from `GraphRow.tsx` to carry the three width modes of
// `graphColumnSizing.ts`:
// - `full`     : historical rendering, nothing is hidden.
// - `overflow` : lines are clipped at the overflow zone's edge and the markers that would fall
//                under it are pinned there in semi-transparency.
// - `compact`  : no lines at all, only the marker centered in the column.
// On top of that the column can be scrolled sideways (`layout.scrollX`): the lines shift with the
// lanes, and get clipped a second time on the left, where the mirror zone holds the markers that
// scrolled past the edge.

import type { GitGraphNode, WorktreeAgentActivity } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { AlertTriangle } from 'lucide-react'
import { GraphSvg } from '../GraphSvg'
import type { GraphColumnLayout, MarkerPlacement } from '../graphColumnSizing'
import { GraphAvatarTooltip } from './GraphAvatarTooltip'
import { AgentLogo, agentColor, agentLabel } from './AgentLogo'

/** True for both the primary WIP row (`'WIP'`) and per-worktree WIP rows (`'WIP:<path>'`). */
export function isWipRow(oid: string): boolean {
  return oid === 'WIP' || oid.startsWith('WIP:')
}

interface GraphCellProps {
  node: GitGraphNode
  /** Width of the `refs` column (the lines' clip extends underneath it). */
  refsWidth: number
  /** Total width (content box) of the graph column. */
  graphWidth: number
  layout: GraphColumnLayout
  marker: MarkerPlacement
  avatarSize: number
  isFirst?: boolean
  /** AI agent working in this WIP row's worktree, if any — its logo replaces the empty dashed ring
   * and its accent recolours the ring. Only meaningful on WIP rows. */
  agentActivity?: WorktreeAgentActivity
}

export function GraphCell({
  node,
  refsWidth,
  graphWidth,
  layout,
  marker,
  avatarSize,
  isFirst,
  agentActivity,
}: GraphCellProps) {
  const isStash = node.refs.some((r) => r.type === 'stash')
  const isWipLike = isWipRow(node.commit.oid) || node.commit.oid === 'CONFLICT'
  // Show the agent glyph on a WIP ring (never on the CONFLICT ring, which owns the warning icon).
  // Narrowed to a nullable value (not a boolean) so property access below type-checks.
  const agent = agentActivity && node.commit.oid !== 'CONFLICT' ? agentActivity : null

  // Left edge of the lines' clip. At rest it extends under the `refs` column (harmless: nothing is
  // drawn there, and it keeps the historical geometry); as soon as the column is scrolled it moves
  // to the left zone's edge so the lines stop where the pinned markers begin.
  const clipLeft = layout.scrollX > 0 ? layout.leftOverlayEnd : -refsWidth

  return (
    <div className="relative flex h-full w-full items-center overflow-visible">
      {/* Clip container, widened for the graph only — in overflow mode the clip's right edge stops
       * at the start of the overflow zone to cut the links. */}
      {layout.mode !== 'compact' && (
        <div
          className="pointer-events-none absolute overflow-hidden"
          style={{
            left: clipLeft,
            right: layout.mode === 'overflow' ? graphWidth - layout.overlayStart : 0,
            top: -4,
            bottom: -5,
            // Fades toward 0 as the column nears the compact boundary, so the lines are already
            // gone when the mode flips instead of vanishing in one frame.
            opacity: layout.linesOpacity,
          }}
        >
          {/* Inner container realigned on the graph column — offset by the scroll so the lanes
           * travel with their markers. */}
          <div
            className="pointer-events-none absolute"
            style={{ left: -clipLeft - layout.scrollX, right: 0, top: 0, bottom: 0 }}
          >
            <GraphSvg
              column={node.column}
              connections={node.connections}
              isWip={isWipLike}
              isStash={isStash}
              isFirst={isFirst}
            />
          </div>
        </div>
      )}

      {/* Plain, direct clip container for the avatars */}
      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 overflow-hidden">
        {isWipLike ? (
          <div
            className="pointer-events-none absolute flex h-full items-center justify-center"
            style={{
              left: marker.x - avatarSize / 2,
              width: avatarSize,
              opacity: marker.opacity < 1 ? marker.opacity : undefined,
            }}
          >
            <div
              // Pulse the whole ring while the agent is actively producing output — a passive
              // "something is happening here" cue that complements the working/idle status tag.
              //
              // The pulse states its own `animate-duration-1000`, because the `duration-150` next
              // to `transition-all` above also sets `animation-duration` (tailwindcss-animate
              // teaches `duration-*` both) and would otherwise cut the pulse down to 150ms, which
              // reads as a flicker rather than a breath.
              className={cn(
                'flex select-none items-center justify-center rounded-full border border-dashed shadow-sm transition-all duration-150',
                agent?.state === 'working' && 'animate-pulse animate-duration-1000'
              )}
              style={{
                width: avatarSize,
                height: avatarSize,
                // The agent's accent recolours the ring so it reads as "an agent owns this row".
                borderColor: agent ? agentColor(agent.agent) : node.color,
                // Opaque page background so the colored band doesn't show through the dashed ring.
                backgroundColor: 'hsl(var(--background))',
              }}
              title={agent ? `${agentLabel(agent.agent)} · ${agent.state}` : undefined}
            >
              {node.commit.oid === 'CONFLICT' ? (
                <AlertTriangle
                  className="text-orange-400"
                  style={{ width: avatarSize * 0.5, height: avatarSize * 0.5 }}
                />
              ) : agent ? (
                <AgentLogo agent={agent.agent} size={avatarSize * 0.56} />
              ) : null}
            </div>
          </div>
        ) : (
          <GraphAvatarTooltip node={node} centerX={marker.x} opacity={marker.opacity} />
        )}
      </div>
    </div>
  )
}
