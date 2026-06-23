import type { GitGraphEdge } from '@git-manager/git-types'

interface GraphSvgProps {
  column: number
  connections: GitGraphEdge[]
  hasRefs?: boolean
  branchColor?: string
  tagLineStart?: number
}

const COL_WIDTH = 36
const ROW_HEIGHT = 40

export function GraphSvg({ column, connections, hasRefs, branchColor, tagLineStart }: GraphSvgProps) {
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
      {/* Ligne horizontale reliant le tag à gauche au nœud de commit */}
      {hasRefs && branchColor && (
        <line
          x1={tagLineStart ?? -24}
          y1={nodeY}
          x2={column * COL_WIDTH + COL_WIDTH / 2}
          y2={nodeY}
          stroke={branchColor}
          strokeWidth={2}
        />
      )}

      {/* Lignes de connexion (full-row, avec angles droits arrondis et background coloré) */}
      {connections.map((edge, i) => {
        const x1 = edge.fromColumn * COL_WIDTH + COL_WIDTH / 2
        const x2 = edge.toColumn * COL_WIDTH + COL_WIDTH / 2

        const yStart = -2
        const yEnd = ROW_HEIGHT + 2

        let d = ''
        if (x1 === x2) {
          // Ligne droite verticale : passe à travers toute la ligne pour assurer la continuité
          d = `M ${x1} ${yStart} L ${x1} ${yEnd}`
        } else {
          // Transition droite avec angles arrondis R = 4
          const sign = x2 > x1 ? 1 : -1
          const R = 4

          if (edge.fromColumn !== column && edge.toColumn !== column) {
            // Pass-through diagonal
            d = `M ${x1} -2 L ${x1} 16 Q ${x1} 20, ${x1 + R * sign} 20 L ${x2 - R * sign} 20 Q ${x2} 20, ${x2} 24 L ${x2} ${ROW_HEIGHT + 2}`
          } else if (edge.fromColumn === column) {
            // Split (départ du milieu/avatar à y = 20)
            d = `M ${x1} ${nodeY} L ${x1} 22 Q ${x1} 26, ${x1 + R * sign} 26 L ${x2 - R * sign} 26 Q ${x2} 26, ${x2} 30 L ${x2} ${ROW_HEIGHT + 2}`
          } else {
            // Merge (arrivée au milieu/avatar à y = 20)
            d = `M ${x1} -2 L ${x1} 10 Q ${x1} 14, ${x1 + R * sign} 14 L ${x2 - R * sign} 14 Q ${x2} 14, ${x2} 18 L ${x2} ${nodeY}`
          }
        }

        return (
          <g key={i}>
            {/* Background band with opacity */}
            <path
              d={d}
              fill="none"
              stroke={edge.color}
              strokeWidth={COL_WIDTH}
              opacity={0.08}
            />
            {/* Foreground main line */}
            <path
              d={d}
              fill="none"
              stroke={edge.color}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </g>
        )
      })}
    </svg>
  )
}
