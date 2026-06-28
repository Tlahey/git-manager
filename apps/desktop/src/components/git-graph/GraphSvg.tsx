import type { GitGraphEdge } from '@git-manager/git-types'

interface GraphSvgProps {
  column: number
  connections: GitGraphEdge[]
  isWip?: boolean
}

const COL_WIDTH = 36
const ROW_HEIGHT = 40

export function GraphSvg({ column, connections, isWip }: GraphSvgProps) {
  const maxCol = connections.reduce(
    (m, c) => Math.max(m, c.fromColumn, c.toColumn),
    column,
  )
  const width = (maxCol + 1) * COL_WIDTH + 4
  const nodeY = ROW_HEIGHT / 2

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      style={{ flexShrink: 0 }}
      className="overflow-visible"
    >

      {/* Lignes de connexion (full-row, avec angles droits arrondis et background coloré) */}
      {connections.map((edge, i) => {
        const x1 = edge.fromColumn * COL_WIDTH + COL_WIDTH / 2
        const x2 = edge.toColumn * COL_WIDTH + COL_WIDTH / 2

        const yStart = -2
        const yEnd = ROW_HEIGHT + 2

        let d = ''
        if (x1 === x2) {
          // Ligne droite verticale : passe à travers toute la ligne pour assurer la continuité
          let yS = yStart
          let yE = yEnd
          if (edge.dashed) {
            if (isWip) {
              // Dans la ligne WIP, la ligne part du bas du rond (y = 20 + 16 = 36)
              yS = nodeY + 16
            } else if (edge.toColumn === column) {
              // Dans la ligne HEAD, la ligne vient du haut et s'arrête au haut du rond (y = 20 - 16 = 4)
              yE = nodeY - 16
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
            d = `M ${x1} -2 L ${x1} 16 Q ${x1} 20, ${x1 + R * sign} 20 L ${x2 - R * sign} 20 Q ${x2} 20, ${x2} 24 L ${x2} ${ROW_HEIGHT + 2}`
          } else if (edge.fromColumn === column) {
            // Split (départ du milieu/avatar à y = 20)
            d = `M ${x1} 20 L ${x2 - R * sign} 20 Q ${x2} 20, ${x2} 24 L ${x2} ${ROW_HEIGHT + 2}`
          } else {
            // Merge (arrivée au milieu/avatar à y = 20)
            d = `M ${x1} -2 L ${x1} 16 Q ${x1} 20, ${x1 + R * sign} 20 L ${x2} 20`
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
