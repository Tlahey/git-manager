// Contenu de la colonne `graph` d'une ligne : lignes de connexion (GraphSvg) + marqueur du
// commit (avatar / dot / anneau WIP). Extrait de `GraphRow.tsx` pour porter les trois modes de
// largeur de `graphColumnSizing.ts` :
// - `full`     : rendu historique, rien n'est masqué.
// - `overflow` : les lignes sont coupées au bord de la zone de débordement et les marqueurs qui
//                tomberaient dessous y sont recentrés en semi-transparence.
// - `compact`  : aucune ligne, uniquement le marqueur centré dans la colonne.

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
  /** Largeur de la colonne `refs` (le clip des lignes s'étend dessous). */
  refsWidth: number
  /** Largeur totale (content box) de la colonne graph. */
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

  return (
    <div className="relative flex h-full w-full items-center overflow-visible">
      {/* Conteneur de découpe (clip) élargi pour le graph uniquement — en mode overflow le bord
       * droit du clip s'arrête au début de la zone de débordement pour couper les liens. */}
      {layout.mode !== 'compact' && (
        <div
          className="pointer-events-none absolute overflow-hidden"
          style={{
            left: -refsWidth,
            right: layout.mode === 'overflow' ? graphWidth - layout.overlayStart : 0,
            top: -4,
            bottom: -5,
            // Fades toward 0 as the column nears the compact boundary, so the lines are already
            // gone when the mode flips instead of vanishing in one frame.
            opacity: layout.linesOpacity,
          }}
        >
          {/* Conteneur interne réaligné sur la colonne graph */}
          <div
            className="pointer-events-none absolute"
            style={{ left: refsWidth, right: 0, top: 0, bottom: 0 }}
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

      {/* Conteneur de découpe simple et direct pour les avatars */}
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
              className={cn(
                'flex select-none items-center justify-center rounded-full border border-dashed shadow-sm transition-all duration-150',
                agent?.state === 'working' && 'animate-pulse'
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
