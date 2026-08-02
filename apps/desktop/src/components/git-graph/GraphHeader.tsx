import { useRef } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { ContextMenu, ContextMenuTrigger, cn } from '@git-manager/ui'
import { Network, Calendar, Hash } from 'lucide-react'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'
import { useSettingsStore } from '../../stores/settings.store'
import { HeaderColumnsMenu } from './HeaderColumnsMenu'
import { GraphHeaderAuthorFilter } from './GraphHeaderAuthorFilter'
import { isGraphCompact } from './graphColumnSizing'
import type { ResolvedColumn } from './columns.config'
import type { AuthorOption } from './graphAuthors'

interface GraphHeaderProps {
  /** Visible columns, in order, with their resolved widths. */
  columns: ResolvedColumn[]
  /** Unique authors across the loaded commits — feeds the "author" column's filter. */
  authorOptions?: AuthorOption[]
}

/** Below this width (px), the date/sha columns show a compact icon instead of their text label
 * (same idea as the graph column's `isGraphCompact`). */
const COMPACT_LABEL_MAX_WIDTH = 72

/** Header icon shown in compact mode, per column. */
const COMPACT_LABEL_ICON = { date: Calendar, sha: Hash } as const

/**
 * Header of the virtual table: column labels, resize handles, and the right-click context menu
 * that shows / hides columns.
 */
export function GraphHeader({ columns, authorOptions = [] }: GraphHeaderProps) {
  const { t } = useTranslation('git')
  const setWidth = useGitGraphColumnsStore((s) => s.setWidth)
  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight || 'standard')
  const avatarSize = rowHeightSetting === 'small' ? 24 : 32

  const rowRef = useRef<HTMLDivElement>(null)

  // A column's ACTUALLY rendered width (the flex column's isn't reliable in `col.width` — flexbox
  // computes it at paint time). Measured off the DOM to know how much room the flex column has
  // left to shrink.
  function renderedWidth(col: ResolvedColumn) {
    const el = rowRef.current?.querySelector<HTMLElement>(`[data-col-key="${col.key}"]`)
    const w = el?.getBoundingClientRect().width ?? 0
    return w > 0 ? w : col.width
  }

  // "Splitter" resizing: a handle lives on the boundary between two adjacent columns
  // (`leftCol` | `rightCol`) and transfers width from one to the other — `leftCol` grows by
  // `delta`, `rightCol` shrinks by as much. The sum stays constant, so ONLY that boundary moves:
  // no distant column shifts. If either side is the flex column (message), only the fixed side is
  // touched and the flex one absorbs the difference locally.
  function handleResizeDown(e: React.PointerEvent, leftCol: ResolvedColumn, rightCol: ResolvedColumn) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startLeft = leftCol.width
    const startRight = rightCol.width
    const leftFixed = !leftCol.flex
    const rightFixed = !rightCol.flex
    // Rendered size of the neighbouring flex column (at most one of the two is) at the start of
    // the drag — how much it can shrink before hitting its minWidth.
    const leftFlexStart = leftFixed ? 0 : renderedWidth(leftCol)
    const rightFlexStart = rightFixed ? 0 : renderedWidth(rightCol)

    // Bound the delta so neither `leftCol` nor `rightCol` crosses its own min/max. Fixed side:
    // clamp against its own min/max. Flex side: it absorbs the opposite variation (+delta on the
    // left, -delta on the right) and must not drop below its minWidth — otherwise it can no longer
    // absorb and the row overflows (date/sha spill out of the content). That bound is what stops
    // the resize at the limit.
    function clampDelta(delta: number) {
      if (leftFixed) {
        const maxL = leftCol.maxWidth ?? Number.POSITIVE_INFINITY
        delta = Math.min(delta, maxL - startLeft)
        delta = Math.max(delta, leftCol.minWidth - startLeft)
      } else {
        // leftCol (flex) varies by +delta → keep it >= its minWidth.
        delta = Math.max(delta, leftCol.minWidth - leftFlexStart)
      }
      if (rightFixed) {
        const maxR = rightCol.maxWidth ?? Number.POSITIVE_INFINITY
        delta = Math.max(delta, startRight - maxR)
        delta = Math.min(delta, startRight - rightCol.minWidth)
      } else {
        // rightCol (flex) varies by -delta → keep it >= its minWidth.
        delta = Math.min(delta, rightFlexStart - rightCol.minWidth)
      }
      return delta
    }

    function onMove(ev: PointerEvent) {
      const delta = clampDelta(ev.clientX - startX)
      if (leftFixed) setWidth(leftCol.key, startLeft + delta)
      if (rightFixed) setWidth(rightCol.key, startRight - delta)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={rowRef}
          className="flex h-7 shrink-0 select-none items-stretch border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {columns.map((col, idx) => {
            // Handle on the boundary with the next column (none after the last one).
            const nextCol = columns[idx + 1]
            // Below a given width the text label is swapped for an icon: graph (marker only) via
            // `isGraphCompact`, date/sha via a width threshold.
            const HeaderIcon =
              col.key === 'graph'
                ? isGraphCompact(col.width, avatarSize)
                  ? Network
                  : null
                : (col.key === 'date' || col.key === 'sha') && col.width < COMPACT_LABEL_MAX_WIDTH
                  ? COMPACT_LABEL_ICON[col.key]
                  : null

            return (
              <div
                key={col.key}
                data-col-key={col.key}
                // The spacing box-model must be STRICTLY identical to the content cells'
                // (GraphRow) — same margins/paddings per column — otherwise the header and the
                // content drift apart column after column (`mx-2` adds 16px more than `px-2` on
                // each cell) and the labels stop sitting above the right column.
                className={cn(
                  'relative flex min-w-0 items-center',
                  col.key === 'refs' ? 'justify-start pl-2' : 'mx-2',
                  col.key === 'graph' && 'px-0'
                )}
                style={
                  col.flex
                    ? { flex: '1 1 0%', minWidth: col.minWidth }
                    : { width: col.width, flexShrink: 0 }
                }
              >
                {HeaderIcon ? (
                  <HeaderIcon className="h-3.5 w-3.5 shrink-0" aria-label={t(col.labelKey)} />
                ) : (
                  <span className="truncate">{t(col.labelKey)}</span>
                )}

                {/* Author filter button, pushed to the right of the "author" column. */}
                {col.key === 'author' && (
                  <span className="ml-auto pl-1">
                    <GraphHeaderAuthorFilter authors={authorOptions} />
                  </span>
                )}

                {/* Resize handle on the `col` | `nextCol` boundary (splitter). */}
                {nextCol &&
                  (() => {
                    // `refs` only has the refs|graph boundary to resize against, but `graph` is
                    // capped at its useful width and can't absorb anything: the refs↔graph trade
                    // deadlocked (refs couldn't shrink). So when `graph` directly follows `refs`,
                    // `refs` is resized against the flex column (message) instead — refs
                    // grows/shrinks, the flex column absorbs it, and `graph` keeps its width.
                    // Otherwise (graph hidden…), a normal splitter with `nextCol`.
                    const partner =
                      col.key === 'refs' && nextCol.key === 'graph'
                        ? (columns.find((c) => c.flex) ?? nextCol)
                        : nextCol
                    return (
                      <div
                        onPointerDown={(e) => handleResizeDown(e, col, partner)}
                        className="group absolute right-0 top-0 z-content h-full w-2 translate-x-1/2 cursor-col-resize"
                      >
                        <div className="mx-auto h-full w-px bg-border transition-colors group-hover:bg-primary/60" />
                      </div>
                    )
                  })()}
              </div>
            )
          })}
        </div>
      </ContextMenuTrigger>

      <HeaderColumnsMenu />
    </ContextMenu>
  )
}
