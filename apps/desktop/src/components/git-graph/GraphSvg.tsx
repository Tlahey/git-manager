import type { GitGraphEdge } from '@git-manager/git-types'
import { useSettingsStore } from '../../stores/settings.store'

interface GraphSvgProps {
  column: number
  connections: GitGraphEdge[]
  isWip?: boolean
  isStash?: boolean
  isFirst?: boolean
}

const COL_WIDTH = 36
/** Corner radius for the rounded turns where a connection line changes column. */
const CORNER_RADIUS = 8

export function GraphSvg({ column, connections, isWip, isStash, isFirst }: GraphSvgProps) {
  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight || 'standard')
  const rowHeight = rowHeightSetting === 'small' ? 32 : 40
  const avatarSize = rowHeightSetting === 'small' ? 24 : 32
  const avatarRadius = avatarSize / 2

  const maxCol = connections.reduce((m, c) => Math.max(m, c.fromColumn, c.toColumn), column)
  const width = (maxCol + 1) * COL_WIDTH + 4
  const nodeY = rowHeight / 2

  return (
    <svg
      width={width}
      height={rowHeight}
      viewBox={`0 0 ${width} ${rowHeight}`}
      style={{ flexShrink: 0 }}
      className="overflow-visible"
    >
      {/* Lignes de connexion (full-row, avec angles droits arrondis et background coloré) */}
      {connections.map((edge, i) => {
        const x1 = edge.fromColumn * COL_WIDTH + COL_WIDTH / 2
        const x2 = edge.toColumn * COL_WIDTH + COL_WIDTH / 2

        const yStart = -2
        const yEnd = rowHeight + 2

        // Whether an edge renders dashed is decided entirely upstream (in Rust): pass-through and
        // structural stash-bridge segments already carry `dashed: true`, so the SVG just trusts
        // the flag — no per-row inference here (see `build_graph_nodes` in `git_graph.rs`).

        let d = ''
        if (x1 === x2) {
          // Ligne droite verticale : passe à travers toute la ligne pour assurer la continuité
          let yS = yStart
          let yE = yEnd
          // Structural segments (anchored at a node via starts/ends-at-node) always use the
          // node-anchored geometry, dashed or not. Only the synthetic dashed connectors that
          // carry no structural anchor (WIP / HEAD / origin-main) use the special geometry below.
          if (edge.dashed && !edge.startsAtNode && !edge.endsAtNode) {
            if (isWip && edge.toColumn === column) {
              // Dans la ligne WIP, la ligne part du bas du rond
              yS = nodeY + avatarRadius
            } else if (edge.toColumn === column) {
              // Dans la ligne HEAD, la ligne vient du haut et s'arrête au haut du rond
              yE = nodeY - avatarRadius
            }
          } else {
            if (edge.startsAtNode) {
              yS = isStash && edge.fromColumn === column ? nodeY + avatarRadius : nodeY
            }
            if (edge.endsAtNode) {
              yE = isStash && edge.toColumn === column ? nodeY - avatarRadius : nodeY
            }
          }
          if (isFirst && yS === yStart) {
            d = ''
          } else {
            d = `M ${x1} ${yS} L ${x1} ${yE}`
          }
        } else {
          // Transition droite avec angles arrondis (R = CORNER_RADIUS)
          const sign = x2 > x1 ? 1 : -1
          const R = CORNER_RADIUS

          if (isFirst) {
            if (edge.fromColumn !== column && edge.toColumn !== column) {
              // Pass-through diagonal starts at -2, so hide it in the first element
              d = ''
            } else if (edge.fromColumn === column) {
              // Split starts at the node, so we DO render it
              const xStart = isStash ? x1 + avatarRadius * sign : x1
              d = `M ${xStart} ${nodeY} L ${x2 - R * sign} ${nodeY} Q ${x2} ${nodeY}, ${x2} ${nodeY + R} L ${x2} ${rowHeight + 2}`
            } else {
              // Merge starts at -2, so hide it in the first element
              d = ''
            }
          } else {
            if (edge.fromColumn !== column && edge.toColumn !== column) {
              // Pass-through diagonal
              d = `M ${x1} -2 L ${x1} ${nodeY - R} Q ${x1} ${nodeY}, ${x1 + R * sign} ${nodeY} L ${x2 - R * sign} ${nodeY} Q ${x2} ${nodeY}, ${x2} ${nodeY + R} L ${x2} ${rowHeight + 2}`
            } else if (edge.fromColumn === column) {
              // Split (départ du milieu/avatar à y = nodeY)
              const xStart = isStash ? x1 + avatarRadius * sign : x1
              d = `M ${xStart} ${nodeY} L ${x2 - R * sign} ${nodeY} Q ${x2} ${nodeY}, ${x2} ${nodeY + R} L ${x2} ${rowHeight + 2}`
            } else {
              // Merge (arrivée au milieu/avatar à y = nodeY)
              const xEnd = isStash ? x2 - avatarRadius * sign : x2
              d = `M ${x1} -2 L ${x1} ${nodeY - R} Q ${x1} ${nodeY}, ${x1 + R * sign} ${nodeY} L ${xEnd} ${nodeY}`
            }
          }
        }

        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={edge.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={edge.dashed ? '4 4' : undefined}
          />
        )
      })}
    </svg>
  )
}
