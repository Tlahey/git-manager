import type { ComponentProps, Ref } from 'react'
import type { GitGraphNode } from '@git-manager/git-types'
import type { Virtualizer } from '@tanstack/react-virtual'
import { CommitDragSlot } from './CommitDragSlot'
import { GraphRow } from './GraphRow'
import { Waterline } from './Waterline'
import { isRowDimmed } from '../lib/rowDimming'

/** Everything a row needs that is the same for every row on screen. What is not — the node, its
 *  selection, its handlers and its tag draft — is resolved per row below. */
export type GraphRowShared = Omit<
  ComponentProps<typeof GraphRow>,
  | 'node'
  | 'columns'
  | 'isSelected'
  | 'isPrimary'
  | 'onSelect'
  | 'onContextMenu'
  | 'isFirst'
  | 'dimmed'
  | 'bisectStatus'
  | 'laneRef'
  | 'isTagDraft'
  | 'onSubmitTag'
  | 'onCancelTag'
>

interface GraphRowListProps {
  /** The scroll container. Shared with the graph column's horizontal scroll, hence a prop. */
  scrollRef: Ref<HTMLDivElement>
  virtualizer: Virtualizer<HTMLDivElement, Element>
  /** The rows as rendered, synthetic ones included — indexed by the virtualizer. */
  nodes: GitGraphNode[]
  rowHeight: number
  columns: ComponentProps<typeof GraphRow>['columns']
  primaryOid: string | null
  selected: Set<string>
  /** The three filter sets, passed through to {@link isRowDimmed}. */
  matchSet: Set<string> | null
  authorMatchSet: Set<string> | null
  dragHighlightSet: Set<string> | null
  bisectStatusFor: (oid: string) => ComponentProps<typeof GraphRow>['bisectStatus']
  laneRefFor: (oid: string) => ComponentProps<typeof GraphRow>['laneRef']
  /** The commit awaiting an inline tag name, or `null`. Only that row gets the two callbacks, which
   *  is what keeps every other (memoized) row from re-rendering while one is being tagged. */
  tagDraftOid: string | null
  onSubmitTag: (name: string) => void
  onCancelTag: () => void
  onSelectRow: (e: React.MouseEvent, node: GitGraphNode, index: number) => void
  onContextMenu: (e: React.MouseEvent, oid: string) => void
  rowProps: GraphRowShared
  /** The fade over the graph column's overflowed lanes, or `null` when none is needed. */
  overflowZone: { left: number; width: number; opacity: number } | null
  waterlines: { id: string; index: number; label: string }[]
}

/**
 * The virtualised commit list: one row per visible item, plus the two overlays that sit above them.
 *
 * The overlays are here rather than in the rows because neither belongs to a row — the overflow zone
 * is a fade over a *column* across the whole list, and a waterline marks a boundary *between* two
 * rows. Both are positioned out of flow against the same scrolling body, which is why they cannot be
 * hoisted any further out either.
 */
export function GraphRowList({
  scrollRef,
  virtualizer,
  nodes,
  rowHeight,
  columns,
  primaryOid,
  selected,
  matchSet,
  authorMatchSet,
  dragHighlightSet,
  bisectStatusFor,
  laneRefFor,
  tagDraftOid,
  onSubmitTag,
  onCancelTag,
  onSelectRow,
  onContextMenu,
  rowProps,
  overflowZone,
  waterlines,
}: GraphRowListProps) {
  return (
    <div
      ref={scrollRef}
      data-testid="commit-graph"
      className="flex-1 overflow-x-hidden overflow-y-auto"
    >
      <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const node = nodes[virtualItem.index]
          const oid = node.commit.oid
          const isTagDraftRow = tagDraftOid === oid

          return (
            <CommitDragSlot
              key={virtualItem.key}
              oid={oid}
              testId={`graph-row-${oid}`}
              selected={oid === primaryOid || selected.has(oid)}
              className="hover:z-graph-row-hover"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: rowHeight,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <GraphRow
                {...rowProps}
                node={node}
                columns={columns}
                isSelected={selected.has(oid)}
                isPrimary={oid === primaryOid}
                onSelect={(e) => onSelectRow(e, node, virtualItem.index)}
                onContextMenu={(e) => onContextMenu(e, oid)}
                isFirst={virtualItem.index === 0}
                dimmed={isRowDimmed(oid, { matchSet, authorMatchSet, dragHighlightSet })}
                bisectStatus={bisectStatusFor(oid)}
                laneRef={laneRefFor(oid)}
                isTagDraft={isTagDraftRow}
                onSubmitTag={isTagDraftRow ? onSubmitTag : undefined}
                onCancelTag={isTagDraftRow ? onCancelTag : undefined}
              />
            </CommitDragSlot>
          )
        })}

        {/* Overflow zone: full height, above the colored bands (z-graph-overflow) but below the
            cells (z-content) — markers stay visible. */}
        {overflowZone && (
          <div
            data-testid="graph-overflow-zone"
            className="pointer-events-none absolute inset-y-0 z-graph-overflow"
            style={{
              left: overflowZone.left,
              width: overflowZone.width,
              opacity: overflowZone.opacity,
              // The zone is a transparent "card": its content keeps its own colors, only an outer
              // shadow on its left edge detaches it from the rest of the graph.
              boxShadow: '-8px 0 12px -4px rgb(0 0 0 / 0.35)',
            }}
          />
        )}

        {/* Waterlines: full-width overlays on the boundaries, out of flow */}
        {waterlines.map((wl) => (
          <div
            key={wl.id}
            className="pointer-events-none absolute left-0 z-content w-full"
            style={{
              top: 0,
              height: rowHeight,
              transform: `translateY(${wl.index * rowHeight - rowHeight / 2}px)`,
            }}
          >
            <Waterline label={wl.label} />
          </div>
        ))}
      </div>
    </div>
  )
}
