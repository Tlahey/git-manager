import type { GitGraphEdge } from '@git-manager/git-types'
import { useSettingsStore } from '../../stores/settings.store'

interface GraphSvgProps {
  column: number
  connections: GitGraphEdge[]
  isWip?: boolean
}

const COL_WIDTH = 36

export function GraphSvg({ column, connections, isWip }: GraphSvgProps) {
  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight || 'standard')
  const rowHeight = rowHeightSetting === 'small' ? 32 : 40
  const avatarSize = rowHeightSetting === 'small' ? 24 : 32
  const avatarRadius = avatarSize / 2

  const maxCol = connections.reduce(
    (m, c) => Math.max(m, c.fromColumn, c.toColumn),
    column,
  )
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

        let d = ''
        if (x1 === x2) {
          // Ligne droite verticale : passe à travers toute la ligne pour assurer la continuité
          let yS = yStart
          let yE = yEnd
          if (edge.dashed) {
            if (isWip && edge.toColumn === column) {
              // Dans la ligne WIP, la ligne part du bas du rond
              yS = nodeY + avatarRadius
            } else if (edge.toColumn === column) {
              // Dans la ligne HEAD, la ligne vient du haut et s'arrête au haut du rond
              yE = nodeY - avatarRadius
            }
          } else {
            if (edge.startsAtNode) {
              yS = nodeY
            }
            if (edge.endsAtNode) {
              yE = nodeY
            }
          }
          d = `M ${x1} ${yS} L ${x1} ${yE}`
        } else {
          // Transition droite avec angles arrondis R = 4
          const sign = x2 > x1 ? 1 : -1
          const R = 4

          if (edge.fromColumn !== column && edge.toColumn !== column) {
            // Pass-through diagonal
            d = `M ${x1} -2 L ${x1} ${nodeY - R} Q ${x1} ${nodeY}, ${x1 + R * sign} ${nodeY} L ${x2 - R * sign} ${nodeY} Q ${x2} ${nodeY}, ${x2} ${nodeY + R} L ${x2} ${rowHeight + 2}`
          } else if (edge.fromColumn === column) {
            // Split (départ du milieu/avatar à y = nodeY)
            d = `M ${x1} ${nodeY} L ${x2 - R * sign} ${nodeY} Q ${x2} ${nodeY}, ${x2} ${nodeY + R} L ${x2} ${rowHeight + 2}`
          } else {
            // Merge (arrivée au milieu/avatar à y = nodeY)
            d = `M ${x1} -2 L ${x1} ${nodeY - R} Q ${x1} ${nodeY}, ${x1 + R * sign} ${nodeY} L ${x2} ${nodeY}`
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

