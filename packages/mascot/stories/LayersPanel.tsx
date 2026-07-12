/**
 * LayersPanel — the Layout editor's paint-order list, with drag-and-drop
 * reordering. Storybook-only, purely presentational: receives the placements
 * in paint order (first = furthest back) and reports selections/reorders via
 * callbacks; the editor owns the document state.
 *
 * Displayed top-to-bottom as front-to-back (like design tools), so the row
 * indices shown to the user are reversed from the paint-order indices used in
 * the callbacks. Drag state lives here (plain HTML5 drag events, no
 * dataTransfer payload — jsdom doesn't implement DataTransfer, and the index
 * in React state is enough).
 */

import { useState } from 'react'
import type { CSSProperties } from 'react'

export interface LayerEntry {
  zone: string
  x: number
  y: number
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 6px',
  borderRadius: 4,
  cursor: 'grab',
  border: '1px solid transparent',
}

export function LayersPanel({
  layers,
  selected,
  uriFor,
  onSelect,
  onReorder,
}: {
  /** Placements in paint order: index 0 = furthest back. */
  layers: LayerEntry[]
  /** Paint-order index of the selected placement, or null. */
  selected: number | null
  /** Thumbnail data URI for a zone, if sliced. */
  uriFor: (zone: string) => string | null
  onSelect: (paintIndex: number) => void
  /** Move the placement at `from` so it ends up at index `to` (paint order). */
  onReorder: (from: number, to: number) => void
}) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const n = layers.length
  const displayRows = layers.map((l, i) => ({ ...l, paint: i })).reverse()

  return (
    <div data-testid="layers-panel">
      <p style={{ color: '#7d95b5', margin: '6px 0' }}>
        haut = devant · glisse une ligne pour changer la profondeur
      </p>
      {displayRows.map((l) => {
        const isSel = selected === l.paint
        const isOver = over === l.paint && dragging !== null && dragging !== l.paint
        const uri = uriFor(l.zone)
        return (
          <div
            key={`${l.zone}-${l.paint}`}
            data-testid={`layer-row-${l.zone}`}
            draggable
            onClick={() => onSelect(l.paint)}
            onDragStart={() => setDragging(l.paint)}
            onDragEnd={() => {
              setDragging(null)
              setOver(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(l.paint)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragging !== null && dragging !== l.paint) onReorder(dragging, l.paint)
              setDragging(null)
              setOver(null)
            }}
            style={{
              ...row,
              background: isSel ? '#16345c' : 'transparent',
              border: isOver ? '1px dashed #35e0c2' : row.border,
              opacity: dragging === l.paint ? 0.4 : 1,
            }}
          >
            <span style={{ color: '#40608f', cursor: 'grab' }}>≡</span>
            {uri ? (
              <img
                src={uri}
                alt={l.zone}
                style={{ width: 26, height: 26, objectFit: 'contain', pointerEvents: 'none' }}
              />
            ) : (
              <span style={{ width: 26, height: 26 }} />
            )}
            <span style={{ color: '#cfe3f5', minWidth: 34 }}>{l.zone}</span>
            <span style={{ color: '#7d95b5', fontSize: 11, fontFamily: 'monospace' }}>
              ({l.x}, {l.y})
            </span>
            <span style={{ color: '#40608f', fontSize: 10, marginLeft: 'auto' }}>
              {l.paint + 1}/{n}
            </span>
          </div>
        )
      })}
    </div>
  )
}
