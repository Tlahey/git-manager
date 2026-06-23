import type { GitGraphEdge } from '@git-manager/git-types'

interface GraphSvgProps {
  column: number
  color: string
  connections: GitGraphEdge[]
}

const COL_WIDTH = 14
const ROW_HEIGHT = 26
const NODE_RADIUS = 4

export function GraphSvg({ column, color, connections }: GraphSvgProps) {
  const maxCol = connections.reduce(
    (m, c) => Math.max(m, c.fromColumn, c.toColumn),
    column,
  )
  const width = (maxCol + 1) * COL_WIDTH + 4
  const nodeX = column * COL_WIDTH + COL_WIDTH / 2
  const nodeY = ROW_HEIGHT / 2

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      style={{ flexShrink: 0 }}
    >
      {/* Lignes de connexion (full-row, top → bottom) */}
      {connections.map((edge, i) => {
        const x1 = edge.fromColumn * COL_WIDTH + COL_WIDTH / 2
        const x2 = edge.toColumn * COL_WIDTH + COL_WIDTH / 2
        return (
          <line
            key={i}
            x1={x1}
            y1={0}
            x2={x2}
            y2={ROW_HEIGHT}
            stroke={edge.color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )
      })}
      {/* Nœud du commit */}
      <circle
        cx={nodeX}
        cy={nodeY}
        r={NODE_RADIUS}
        fill={color}
        stroke="var(--background)"
        strokeWidth={2}
      />
    </svg>
  )
}
