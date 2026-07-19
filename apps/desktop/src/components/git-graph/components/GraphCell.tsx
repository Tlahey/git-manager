// Contenu de la colonne `graph` d'une ligne : lignes de connexion (GraphSvg) + marqueur du
// commit (avatar / dot / anneau WIP). Extrait de `GraphRow.tsx` pour porter les trois modes de
// largeur de `graphColumnSizing.ts` :
// - `full`     : rendu historique, rien n'est masqué.
// - `overflow` : les lignes sont coupées au bord de la zone de débordement et les marqueurs qui
//                tomberaient dessous y sont recentrés en semi-transparence.
// - `compact`  : aucune ligne, uniquement le marqueur centré dans la colonne.

import type { GitGraphNode } from '@git-manager/git-types'
import { AlertTriangle } from 'lucide-react'
import { GraphSvg } from '../GraphSvg'
import type { GraphColumnLayout, MarkerPlacement } from '../graphColumnSizing'
import { GraphAvatarTooltip } from './GraphAvatarTooltip'

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
}

export function GraphCell({
  node,
  refsWidth,
  graphWidth,
  layout,
  marker,
  avatarSize,
  isFirst,
}: GraphCellProps) {
  const isStash = node.refs.some((r) => r.type === 'stash')
  const isWipLike = isWipRow(node.commit.oid) || node.commit.oid === 'CONFLICT'

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
              className="flex select-none items-center justify-center rounded-full border border-dashed shadow-sm transition-all duration-150"
              style={{
                width: avatarSize,
                height: avatarSize,
                borderColor: node.color,
                // Opaque page background so the colored band doesn't show through the dashed ring.
                backgroundColor: 'hsl(var(--background))',
              }}
            >
              {node.commit.oid === 'CONFLICT' && (
                <AlertTriangle
                  className="text-orange-400"
                  style={{ width: avatarSize * 0.5, height: avatarSize * 0.5 }}
                />
              )}
            </div>
          </div>
        ) : (
          <GraphAvatarTooltip node={node} centerX={marker.x} opacity={marker.opacity} />
        )}
      </div>
    </div>
  )
}
