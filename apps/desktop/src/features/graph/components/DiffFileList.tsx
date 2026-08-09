import { useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { GitDiffFile } from '@git-manager/git-types'
import { DiffRow } from './DiffRow'
import { buildDiffRows } from './diffRows'

interface DiffFileListProps {
  files: GitDiffFile[]
  /** Shown when the diff came back with no file at all — each caller words its own "no changes". */
  emptyMessage: string
  /** The scroll container's test id — each dialog keeps the one its e2e steps already look up. */
  testId?: string
}

/**
 * The scrollable body of every "here is a diff" view: one virtualized list over every line of
 * every file.
 *
 * **Virtualized, and it has to stay that way.** This used to render `files.map(hunks.map(
 * lines.map(...)))` — roughly six DOM nodes per diff line, all built up front. Comparing two
 * branches that differ by a few thousand lines therefore constructed tens of thousands of nodes
 * synchronously and froze the window. The flat, fixed-height row model in `diffRows.ts` is what
 * makes windowing possible here; see that file before touching a row's height or letting a row
 * wrap.
 *
 * **Why a plain `overflow-auto` container rather than the shared `ScrollArea`.** Diff lines don't
 * wrap (`whitespace-pre`), so long lines have to be reachable sideways. Each file used to own an
 * `overflow-x-auto` box; virtualization leaves no per-file wrapper to scroll, so horizontal
 * scrolling moves to the list itself — which Radix's ScrollArea can't do, since it renders no
 * horizontal scrollbar and pins its viewport to `overflow-x: hidden` (see the comment in
 * `packages/ui/src/components/scroll-area.tsx`). Two visible consequences, both deliberate: the
 * whole diff scrolls sideways as one instead of file by file, and its scrollable width follows the
 * longest line *currently rendered* rather than the longest in the diff — the price of not
 * measuring every line up front, which is the thing being avoided.
 */
export function DiffFileList({ files, emptyMessage, testId }: DiffFileListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => buildDiffRows(files), [files])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // Exact, not estimated: every row's height is known from its kind (see DIFF_ROW_HEIGHTS), so
    // nothing has to be measured and rows never shift under the scroll position.
    estimateSize: (index) => rows[index].height,
    overscan: 12,
  })

  const virtualItems = virtualizer.getVirtualItems()

  if (files.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-auto pr-3" data-testid={testId}>
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      data-testid={testId}
      className="min-h-0 flex-1 overflow-auto pr-3 font-mono text-xs"
    >
      <div
        className="relative"
        style={{ height: virtualizer.getTotalSize() }}
        data-testid="diff-file-list-content"
      >
        {/* One sliding window rather than one absolutely-positioned box per row. The rows inside it
            stay in normal flow, which is what lets `w-max` size the window to its widest line and
            `min-w-full` (on each row, in DiffRow) stretch every row to that same width: line
            backgrounds and the file box's borders then run the full scrollable width instead of
            stopping at the viewport edge as soon as you scroll sideways. The window itself is
            absolutely positioned so it doesn't fight the spacer above, which owns the total
            height. */}
        <div
          className="absolute left-0 top-0 w-max min-w-full"
          style={{ transform: `translateY(${virtualItems[0]?.start ?? 0}px)` }}
          data-testid="diff-file-list-window"
        >
          {virtualItems.map((item) => (
            <DiffRow key={rows[item.index].key} row={rows[item.index]} />
          ))}
        </div>
      </div>
    </div>
  )
}
