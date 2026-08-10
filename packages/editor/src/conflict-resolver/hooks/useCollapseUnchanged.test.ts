import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { editor } from 'monaco-editor'
import type { MergeBlock } from '../../types'
import { computeInitialPlacements } from '../../mergeBlockLayout'
import type { MergeEditorRefs } from './useMergeEditorRefs'
import { useCollapseUnchanged } from './useCollapseUnchanged'

const LINE_HEIGHT = 18
const LINE_HEIGHT_OPTION_ID = 66

class FakeRange {
  constructor(
    public startLineNumber: number,
    public startColumn: number,
    public endLineNumber: number,
    public endColumn: number
  ) {}
}

const fakeMonaco = {
  Range: FakeRange,
  editor: { EditorOption: { lineHeight: LINE_HEIGHT_OPTION_ID } },
}

interface FakeOverlayWidget {
  getId: () => string
  getDomNode: () => HTMLElement
}

/** Minimal fake pane covering exactly the Monaco surface useCollapseUnchanged touches: uniform
 * `LINE_HEIGHT`-per-line geometry via `getTopForLineNumber` (mirrors the real API's contract —
 * document-space, unaffected by scroll or view-zone virtualization) plus add/removeOverlayWidget,
 * which the desktop app's own `packages/editor/src/__tests__/fakeMonacoPane.tsx` doesn't stub
 * since nothing exercised it before the sticky-banner overlay was added. */
function createFakePane() {
  let scrollTop = 0
  const overlayWidgets: FakeOverlayWidget[] = []
  const pane = {
    getScrollTop: () => scrollTop,
    setScrollTop: (value: number) => {
      scrollTop = value
    },
    getTopForLineNumber: (line: number) => (line - 1) * LINE_HEIGHT,
    getOption: () => LINE_HEIGHT,
    changeViewZones: (
      cb: (accessor: {
        addZone: (zone: unknown) => string
        removeZone: (id: string) => void
      }) => void
    ) => {
      let counter = 0
      cb({ addZone: () => `zone-${++counter}`, removeZone: () => {} })
    },
    addOverlayWidget: (widget: FakeOverlayWidget) => {
      overlayWidgets.push(widget)
    },
    removeOverlayWidget: (widget: FakeOverlayWidget) => {
      const index = overlayWidgets.findIndex((w) => w.getId() === widget.getId())
      if (index !== -1) overlayWidgets.splice(index, 1)
    },
    overlayWidgets,
  }
  return pane
}

function editorsWith(
  theirs: ReturnType<typeof createFakePane>,
  center: ReturnType<typeof createFakePane>,
  ours: ReturnType<typeof createFakePane>
): MergeEditorRefs {
  return {
    monacoRef: { current: fakeMonaco as unknown as MergeEditorRefs['monacoRef']['current'] },
    oursEditorRef: { current: ours as unknown as editor.IStandaloneCodeEditor },
    centerEditorRef: { current: center as unknown as editor.IStandaloneCodeEditor },
    theirsEditorRef: { current: theirs as unknown as editor.IStandaloneCodeEditor },
    oursDecorationsRef: { current: null },
    centerDecorationsRef: { current: null },
    theirsDecorationsRef: { current: null },
    oursIntraDecorationsRef: { current: null },
    centerIntraDecorationsRef: { current: null },
    theirsIntraDecorationsRef: { current: null },
    oursZoneIdsRef: { current: [] },
    centerZoneIdsRef: { current: [] },
    theirsZoneIdsRef: { current: [] },
    oursCollapsedViewZonesRef: { current: [] },
    centerCollapsedViewZonesRef: { current: [] },
    theirsCollapsedViewZonesRef: { current: [] },
  }
}

function makeSingleUnchangedBlock(lineCount: number): MergeBlock[] {
  const lines = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`)
  return [
    {
      blockId: 1,
      kind: 'unchanged',
      oursStartLine: 1,
      oursLineCount: lineCount,
      theirsStartLine: 1,
      theirsLineCount: lineCount,
      oursLines: lines,
      theirsLines: lines,
    },
  ]
}

describe('useCollapseUnchanged', () => {
  // 20-line unchanged block, COLLAPSE_CONTEXT_LINES=3 either side -> hides lines 4..17 (14
  // lines), banner anchored after line 3. naturalTop = getTopForLineNumber(3) + LINE_HEIGHT =
  // 2*18 + 18 = 54; bannerHeight = 1.5*18 = 27 -> pinned (top clamped to 0) while scrollTop is
  // in (54, 81), and tracking `54 - scrollTop` normally outside that span.

  it('creates the overlay banner eagerly and renders it full width via `right: 0`, not the document scroll width', () => {
    const blocks = makeSingleUnchangedBlock(20)
    const placements = computeInitialPlacements(blocks)
    const theirs = createFakePane()
    const center = createFakePane()
    const ours = createFakePane()
    const editors = editorsWith(theirs, center, ours)

    renderHook(() =>
      useCollapseUnchanged({
        editors,
        blocks,
        placements,
        scheduleRecompute: () => {},
        defaultCollapseUnchanged: true,
        collapsedLinesLabel: (count: number) => `${count} lines collapsed`,
        editorsReady: true,
      })
    )

    // Created immediately, before any scroll — this is the "normal, in document flow" banner,
    // not just a lazily-created pinned copy.
    expect(center.overlayWidgets).toHaveLength(1)
    const domNode = center.overlayWidgets[0].getDomNode() as HTMLDivElement
    expect(domNode.style.right).toBe('0px')
    expect(domNode.style.left).toBe('')
    expect(domNode.getAttribute('data-collapsed-block-id')).toBe('1')
    expect(domNode.querySelector('.monaco-collapsed-zone-banner-label')?.textContent).toBe(
      '14 lines collapsed'
    )
  })

  it('tracks normal scroll before the span, pins to 0 inside it, and resumes past it', () => {
    const blocks = makeSingleUnchangedBlock(20)
    const placements = computeInitialPlacements(blocks)
    const theirs = createFakePane()
    const center = createFakePane()
    const ours = createFakePane()
    const editors = editorsWith(theirs, center, ours)

    const { result } = renderHook(() =>
      useCollapseUnchanged({
        editors,
        blocks,
        placements,
        scheduleRecompute: () => {},
        defaultCollapseUnchanged: true,
        collapsedLinesLabel: (count: number) => `${count} lines collapsed`,
        editorsReady: true,
      })
    )

    const domNode = center.overlayWidgets[0].getDomNode() as HTMLDivElement

    act(() => center.setScrollTop(0))
    act(() => result.current.applyStickyBanners())
    expect(domNode.style.top).toBe('54px') // naturalTop - scrollTop, normal in-flow position
    // Explicit height, matching the connector wave's own bannerHeight — an overlay widget
    // (unlike a view zone) isn't sized by Monaco itself, so this has to be set by hand or the
    // banner's wave decoration (centered via align-items) drifts from the connector's midpoint.
    expect(domNode.style.height).toBe('27px')

    act(() => center.setScrollTop(60))
    act(() => result.current.applyStickyBanners())
    expect(domNode.style.top).toBe('0px') // inside (54, 81) -> pinned

    act(() => center.setScrollTop(90))
    act(() => result.current.applyStickyBanners())
    expect(domNode.style.top).toBe('-9px') // past the span -> resumes scrolling off-screen
  })

  it('does not touch the side panes when only the center pane has scrolled', () => {
    const blocks = makeSingleUnchangedBlock(20)
    const placements = computeInitialPlacements(blocks)
    const theirs = createFakePane()
    const center = createFakePane()
    const ours = createFakePane()
    const editors = editorsWith(theirs, center, ours)

    const { result } = renderHook(() =>
      useCollapseUnchanged({
        editors,
        blocks,
        placements,
        scheduleRecompute: () => {},
        defaultCollapseUnchanged: true,
        collapsedLinesLabel: (count: number) => `${count} lines collapsed`,
        editorsReady: true,
      })
    )

    const theirsDomNode = theirs.overlayWidgets[0].getDomNode() as HTMLDivElement
    const oursDomNode = ours.overlayWidgets[0].getDomNode() as HTMLDivElement
    const theirsTopBefore = theirsDomNode.style.top
    const oursTopBefore = oursDomNode.style.top

    act(() => center.setScrollTop(60))
    act(() => result.current.applyStickyBanners())

    expect(theirsDomNode.style.top).toBe(theirsTopBefore)
    expect(oursDomNode.style.top).toBe(oursTopBefore)
  })

  it('removes the overlay widget once the block is expanded', () => {
    const blocks = makeSingleUnchangedBlock(20)
    const placements = computeInitialPlacements(blocks)
    const theirs = createFakePane()
    const center = createFakePane()
    const ours = createFakePane()
    const editors = editorsWith(theirs, center, ours)

    const { result } = renderHook(() =>
      useCollapseUnchanged({
        editors,
        blocks,
        placements,
        scheduleRecompute: () => {},
        defaultCollapseUnchanged: true,
        collapsedLinesLabel: (count: number) => `${count} lines collapsed`,
        editorsReady: true,
      })
    )

    expect(center.overlayWidgets).toHaveLength(1)

    act(() => result.current.expandBlock(1))

    expect(center.overlayWidgets).toHaveLength(0)
  })

  it('removes every overlay widget when collapseUnchanged is toggled off', () => {
    const blocks = makeSingleUnchangedBlock(20)
    const placements = computeInitialPlacements(blocks)
    const theirs = createFakePane()
    const center = createFakePane()
    const ours = createFakePane()
    const editors = editorsWith(theirs, center, ours)

    const { result } = renderHook(() =>
      useCollapseUnchanged({
        editors,
        blocks,
        placements,
        scheduleRecompute: () => {},
        defaultCollapseUnchanged: true,
        collapsedLinesLabel: (count: number) => `${count} lines collapsed`,
        editorsReady: true,
      })
    )

    expect(center.overlayWidgets).toHaveLength(1)

    act(() => result.current.setCollapseUnchanged(false))

    expect(center.overlayWidgets).toHaveLength(0)
    expect(theirs.overlayWidgets).toHaveLength(0)
    expect(ours.overlayWidgets).toHaveLength(0)
  })
})
