import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { editor, IRange } from 'monaco-editor'
import type { MergeBlock } from '../../types'
import type { BlockPlacement } from '../../mergeBlockLayout'
import { setHiddenAreas } from '../monacoInterop'
import { collapsedRegionsForPane, setCollapsedBlockHover } from '../collapsedRegions'
import {
  COLLAPSED_BANNER_HEIGHT_LINES,
  DEFAULT_LINE_HEIGHT,
  stickyTopCorrection,
} from '../../mergeViewConfig'
import type { MergeEditorRefs } from './useMergeEditorRefs'

interface BannerZoneInfo {
  afterLineNumber: number
  collapsedCount: number
  blockId: number
}

type PaneKey = 'theirs' | 'center' | 'ours'

interface StickyOverlay {
  widget: editor.IOverlayWidget
  /** HTMLElement, not HTMLDivElement: the banner is a <button>. */
  domNode: HTMLElement
  /** Where the banner currently belongs, in the pane's viewport space.
   *
   * A mutable box rather than a style write, because Monaco owns this widget's `top` and will
   * reassert it: its overlay-widget part re-reads `getPosition()` for every widget on every render
   * pass (`overlayWidgets.js`'s `render`) and pushes the result through a `FastDomNode`, which
   * caches the last value it wrote and skips the DOM when it matches. Writing `style.top` directly
   * therefore left that cache stale at `''`, so Monaco's next frame saw `'' !== '0px'`, wrote the
   * `top: 0` its `getPosition()` still advertised, and every banner snapped to the pane's first
   * line until the next pin moved it back — the "waves start at line 1 then teleport" flicker.
   * Answering the question honestly, and asking Monaco to re-read it (`layoutOverlayWidget`), makes
   * that disagreement impossible instead of racing it. */
  position: { top: number }
}

interface UseCollapseUnchangedParams {
  editors: MergeEditorRefs
  blocks: MergeBlock[]
  placements: Map<number, BlockPlacement>
  scheduleRecompute: () => void
  defaultCollapseUnchanged: boolean
  /** Formats the banner's text, e.g. "12 lines collapsed" — host-provided so it can be
   * translated and pluralised; falls back to English. */
  collapsedLinesLabel: (count: number) => string
  /** A line's top Y offset in a pane's content space — the resolver's own collapse/zone-aware
   * geometry (`useLineTopGeometry`), NOT Monaco's `getTopForLineNumber`.
   *
   * Monaco updates its internal line-height mapping on its own layout pass, so right after
   * `setHiddenAreas` + `changeViewZones` its answer still describes the *uncollapsed* document: the
   * banners were placed against that stale mapping and only reached their real position when the
   * follow-up re-pins below ran. The geometry here is a pure function of the blocks, placements and
   * expansions being applied, so it is already correct — and it is the same source the connector
   * waves in the gaps are drawn from, so a banner can no longer drift from the ribbon it belongs
   * to. */
  lineTop: (side: PaneKey, lineNumber: number) => number
  /** Flips to `true` once every pane's Monaco instance has mounted. The `editors` bundle is a
   * stable ref object, so mutating its `.current` handles never re-triggers the apply effect on
   * its own — without this flag in the deps, the effect's first (and, with static `blocks`/
   * `placements`, only) run happens while the editor refs are still `null` and silently no-ops,
   * leaving the panes uncollapsed until some unrelated dependency change happens to re-run it. */
  editorsReady: boolean
}

/** Forces Monaco to paint, in this same task, everything an apply pass just handed it.
 *
 * Guarded on the method's presence for the same reason `useMergeDecorations` guards
 * `updateOptions`: the suites' fake panes implement only the Monaco surface the resolver actually
 * exercises, and a real pane can be mid-teardown. */
function renderPane(paneEditor: editor.IStandaloneCodeEditor | null) {
  if (paneEditor && typeof paneEditor.render === 'function') paneEditor.render(true)
}

/** The collapse-unchanged feature: hides the middle of long unchanged blocks in every pane via
 * Monaco's (private) `setHiddenAreas` API, reserves the vertical space the hidden lines used to
 * occupy with an invisible view-zone spacer, and renders the visible "N lines collapsed" banner
 * as a Monaco *overlay widget* instead of the view zone's own dom node.
 *
 * This split exists because a view zone's dom node is sized by Monaco to the *document's* full
 * scroll width (the widest line anywhere in the file), not the visible viewport — a single long
 * line elsewhere made the banner far wider than the screen and shift with horizontal scroll.
 * Overlay widgets live in Monaco's `.overlayWidgets` layer, a sibling of the scrollable content
 * that Monaco sizes to the editor's own viewport and never transforms for scroll (horizontal or
 * vertical) — see `applyStickyBanners`, which uses that same never-scrolls property to additionally
 * pin a region's banner to the top of the viewport for as long as the user has scrolled into its
 * span, instead of letting it scroll past like a normal line.
 *
 * Clicking a banner (or the connector wave — see `onExpandBlock`) expands that one block;
 * toggling the feature off restores everything and resets the per-block expansions. */
export function useCollapseUnchanged({
  editors,
  blocks,
  placements,
  scheduleRecompute,
  defaultCollapseUnchanged,
  collapsedLinesLabel,
  lineTop,
  editorsReady,
}: UseCollapseUnchangedParams) {
  const [collapseUnchanged, setCollapseUnchanged] = useState(defaultCollapseUnchanged)
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set())

  // Every currently-live banner's line-anchor info, keyed by pane — read by applyStickyBanners
  // on each scroll tick. Line numbers, not pixel positions: Monaco resets a view zone's own
  // `top` to 0 whenever its internal viewport culling considers the zone "not visible" (exactly
  // the zones we care about, scrolled just past the top edge), so naturalTop is recomputed fresh
  // from the line geometry every time instead of cached from view-zone DOM state.
  const bannerInfoRef = useRef<Record<PaneKey, BannerZoneInfo[]>>({
    theirs: [],
    center: [],
    ours: [],
  })

  // One overlay widget per currently-collapsed block, keyed by pane then blockId.
  const stickyOverlaysRef = useRef<Record<PaneKey, Map<number, StickyOverlay>>>({
    theirs: new Map(),
    center: new Map(),
    ours: new Map(),
  })

  useEffect(() => {
    setExpandedBlocks(new Set())
  }, [collapseUnchanged])

  const expandBlock = useCallback((blockId: number) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev)
      next.add(blockId)
      return next
    })
  }, [])

  const clearStickyOverlays = useCallback(
    (paneEditor: editor.IStandaloneCodeEditor | null, key: PaneKey) => {
      const overlays = stickyOverlaysRef.current[key]
      if (paneEditor) {
        overlays.forEach(({ widget }) => paneEditor.removeOverlayWidget(widget))
      }
      overlays.clear()
    },
    []
  )

  // Builds one overlay-widget banner per collapsed region — assumes the pane's previous overlays
  // were already cleared (see the effect below, which always clears before recreating).
  const createStickyOverlays = useCallback(
    (paneEditor: editor.IStandaloneCodeEditor | null, key: PaneKey, infos: BannerZoneInfo[]) => {
      if (!paneEditor || infos.length === 0) return
      const overlays = stickyOverlaysRef.current[key]

      infos.forEach((info) => {
        // A real <button>, not a styled div: it is a control — clicking it expands the region —
        // and only a button is focusable and Enter/Space-operable without reimplementing both.
        // `all: unset` in styles.css strips the UA button chrome, so this renders identically to
        // the div it replaces (the package's Playwright baselines cover it).
        const domNode = document.createElement('button')
        domNode.type = 'button'
        domNode.className = 'monaco-collapsed-zone-banner'
        domNode.style.pointerEvents = 'auto'
        domNode.setAttribute('aria-label', collapsedLinesLabel(info.collapsedCount))
        // The overlay widget layer only ever sets `top`/`left`/`position` from getPosition()
        // (once, at addOverlayWidget time) — `right` is ours to own, giving the banner the same
        // full-width span (viewport width here, not document scroll width) as a real fold line.
        domNode.style.right = '0'
        domNode.setAttribute('data-collapsed-block-id', String(info.blockId))

        const label = document.createElement('span')
        label.className = 'monaco-collapsed-zone-banner-label'
        label.textContent = collapsedLinesLabel(info.collapsedCount)
        domNode.appendChild(label)

        const onTrigger = (e: MouseEvent) => {
          e.stopPropagation()
          e.preventDefault()
          expandBlock(info.blockId)
        }
        domNode.addEventListener('mousedown', onTrigger, true)
        domNode.addEventListener('click', onTrigger, true)
        domNode.addEventListener('mouseenter', () => setCollapsedBlockHover(info.blockId, true))
        domNode.addEventListener('mouseleave', () => setCollapsedBlockHover(info.blockId, false))

        // Starts at 0 and is filled in by the `applyStickyBanners()` call that always follows this
        // one, synchronously, in the same task — well before Monaco's next render pass can ask.
        const position = { top: 0 }
        const widget: editor.IOverlayWidget = {
          getId: () => `merge-editor-collapsed-banner-${key}-${info.blockId}`,
          getDomNode: () => domNode,
          // The `{ top, left }` form, so Monaco writes `top`/`left`/`position` and nothing else —
          // `right: 0` above (the banner's full-viewport-width span) and the height set by
          // applyStickyBanners stay ours to own. See `StickyOverlay.position`.
          getPosition: () => ({ preference: { top: position.top, left: 0 } }),
        }
        paneEditor.addOverlayWidget(widget)
        overlays.set(info.blockId, { widget, domNode, position })
      })
    },
    [expandBlock, collapsedLinesLabel]
  )

  // Repositions every collapsed-region overlay for the current scroll position: a region's
  // banner tracks the scroll normally (`naturalTop - scrollTop`, exactly where a view-zone
  // banner would render) until it would be clipped off the top edge, then pins to `top: 0`
  // for the rest of its own height instead of scrolling further — see stickyTopCorrection.
  // Regions outside the current viewport just render off the visible area, clipped by the
  // editor's own `overflow: hidden`, so no separate show/hide bookkeeping is needed.
  const applyStickyBanners = useCallback(() => {
    const centerEditor = editors.centerEditorRef.current
    const lineHeight =
      editors.monacoRef.current && centerEditor
        ? centerEditor.getOption(editors.monacoRef.current.editor.EditorOption.lineHeight)
        : DEFAULT_LINE_HEIGHT
    const bannerHeight = COLLAPSED_BANNER_HEIGHT_LINES * lineHeight

    const pinPane = (
      paneEditor: editor.IStandaloneCodeEditor | null,
      key: PaneKey,
      infos: BannerZoneInfo[]
    ) => {
      if (!paneEditor) return
      const overlays = stickyOverlaysRef.current[key]
      if (overlays.size === 0) return

      const scrollTop = paneEditor.getScrollTop()
      infos.forEach((info) => {
        const overlay = overlays.get(info.blockId)
        if (!overlay) return

        // The banner sits immediately below `afterLineNumber` (the last visible context line before
        // the hidden range), so its own top is that line's bottom. Resolved through the resolver's
        // own geometry rather than Monaco's — see the `lineTop` param.
        const naturalTop = lineTop(key, info.afterLineNumber) + lineHeight
        const correction = stickyTopCorrection(scrollTop, naturalTop, bannerHeight)
        const top = naturalTop - scrollTop + correction

        // Through Monaco, never around it: this is the write that used to go to `style.top` and get
        // reasserted a frame later (see `StickyOverlay.position`).
        if (overlay.position.top !== top) {
          overlay.position.top = top
          paneEditor.layoutOverlayWidget(overlay.widget)
        }
        // Height, on the other hand, is genuinely ours: unlike a view zone (which Monaco sizes
        // itself via `setHeight`) an overlay widget's height is left entirely to its own
        // CSS/content, and `_renderWidget` never touches it. Without this the banner's wave
        // decoration (centered within its own box via `align-items: center`) collapses to whatever
        // height the label's opacity-0 text naturally takes, landing at a different Y than the
        // connector wave's midpoint (computed from this same `bannerHeight`) expects, which reads as
        // a small vertical seam between the two.
        overlay.domNode.style.height = `${bannerHeight}px`
      })
    }

    pinPane(editors.theirsEditorRef.current, 'theirs', bannerInfoRef.current.theirs)
    pinPane(centerEditor, 'center', bannerInfoRef.current.center)
    pinPane(editors.oursEditorRef.current, 'ours', bannerInfoRef.current.ours)
  }, [editors, lineTop])

  // Apply collapseUnchanged regions to standard Monaco editors using hiddenAreas API and custom view zones
  useEffect(() => {
    const theirsEditor = editors.theirsEditorRef.current
    const centerEditor = editors.centerEditorRef.current
    const oursEditor = editors.oursEditorRef.current

    // Clean up previous view zones
    const clearZones = (
      paneEditor: editor.IStandaloneCodeEditor | null,
      zoneIdsRef: MutableRefObject<string[]>
    ) => {
      if (paneEditor && zoneIdsRef.current.length > 0) {
        paneEditor.changeViewZones((accessor) => {
          zoneIdsRef.current.forEach((id) => accessor.removeZone(id))
        })
        zoneIdsRef.current = []
      }
    }

    clearZones(theirsEditor, editors.theirsCollapsedViewZonesRef)
    clearZones(centerEditor, editors.centerCollapsedViewZonesRef)
    clearZones(oursEditor, editors.oursCollapsedViewZonesRef)
    clearStickyOverlays(theirsEditor, 'theirs')
    clearStickyOverlays(centerEditor, 'center')
    clearStickyOverlays(oursEditor, 'ours')

    if (!collapseUnchanged || !editors.monacoRef.current) {
      setHiddenAreas(theirsEditor, [])
      setHiddenAreas(centerEditor, [])
      setHiddenAreas(oursEditor, [])
      bannerInfoRef.current = { theirs: [], center: [], ours: [] }
      scheduleRecompute()
      return
    }

    const monacoInstance = editors.monacoRef.current

    const regionsFor = (side: 'ours' | 'theirs' | 'center') =>
      collapsedRegionsForPane(blocks, placements, expandedBlocks, side)
    const toMonacoHidden = (regions: ReturnType<typeof regionsFor>): IRange[] =>
      regions.map((r) => new monacoInstance.Range(r.startHide, 1, r.endHide, 1))
    const toZonesToAdd = (regions: ReturnType<typeof regionsFor>): BannerZoneInfo[] =>
      regions.map((r) => ({
        afterLineNumber: r.startHide - 1,
        collapsedCount: r.collapsedCount,
        blockId: r.blockId,
      }))

    const theirsRegions = regionsFor('theirs')
    const oursRegions = regionsFor('ours')
    const centerRegions = regionsFor('center')

    setHiddenAreas(theirsEditor, toMonacoHidden(theirsRegions))
    setHiddenAreas(centerEditor, toMonacoHidden(centerRegions))
    setHiddenAreas(oursEditor, toMonacoHidden(oursRegions))

    // Reserve the vertical space the hidden lines used to occupy with a plain, invisible spacer
    // — the actual "N lines collapsed" banner is rendered by the overlay widgets (see
    // createStickyOverlays) instead of this zone's own dom node.
    const addSpacerZones = (
      paneEditor: editor.IStandaloneCodeEditor | null,
      zonesToAdd: BannerZoneInfo[],
      zoneIdsRef: MutableRefObject<string[]>
    ) => {
      if (!paneEditor || zonesToAdd.length === 0) return
      paneEditor.changeViewZones((accessor) => {
        zonesToAdd.forEach((zone) => {
          const domNode = document.createElement('div')
          domNode.style.pointerEvents = 'none'
          const id = accessor.addZone({
            afterLineNumber: zone.afterLineNumber,
            heightInLines: COLLAPSED_BANNER_HEIGHT_LINES,
            domNode,
            showInHiddenAreas: true,
            suppressMouseDown: true,
          })
          zoneIdsRef.current.push(id)
        })
      })
    }

    const theirsZones = toZonesToAdd(theirsRegions)
    const centerZones = toZonesToAdd(centerRegions)
    const oursZones = toZonesToAdd(oursRegions)

    addSpacerZones(theirsEditor, theirsZones, editors.theirsCollapsedViewZonesRef)
    addSpacerZones(centerEditor, centerZones, editors.centerCollapsedViewZonesRef)
    addSpacerZones(oursEditor, oursZones, editors.oursCollapsedViewZonesRef)

    bannerInfoRef.current = { theirs: theirsZones, center: centerZones, ours: oursZones }

    createStickyOverlays(theirsEditor, 'theirs', theirsZones)
    createStickyOverlays(centerEditor, 'center', centerZones)
    createStickyOverlays(oursEditor, 'ours', oursZones)

    scheduleRecompute()
    applyStickyBanners()

    /* Everything above — hidden areas, spacer zones, banners and their positions — has now been
     * handed to Monaco, but Monaco would paint it on an animation frame of its own, and the browser
     * is free to paint the pane before that: one frame of the file uncollapsed. `render(true)` (a
     * documented part of the editor API: "Force an editor render now") closes that window by
     * flushing the view synchronously, so this whole pass lands in a single task and the next paint
     * can only show its result.
     *
     * This is what makes the intermediate state not exist, rather than hiding it — every attempt to
     * hide it instead (an opacity gate over the panes) had to guess how long to wait, and guessed
     * wrong in both directions. */
    renderPane(theirsEditor)
    renderPane(centerEditor)
    renderPane(oursEditor)
    const t1 = setTimeout(() => {
      scheduleRecompute()
      applyStickyBanners()
    }, 50)
    const t2 = setTimeout(() => {
      scheduleRecompute()
      applyStickyBanners()
    }, 150)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      // Read `.current` HERE rather than reusing the `theirsEditor`/`centerEditor`/`oursEditor`
      // captured at the top of the effect — which is what `exhaustive-deps` asks for, and is
      // wrong in this one place. On unmount the pane refs are nulled *before* this cleanup runs,
      // so reading them now makes clearZones/clearStickyOverlays no-op; the disposed Monaco
      // instance takes its own view zones with it. Using the captured value instead would call
      // `changeViewZones` on an already-disposed editor.
      /* oxlint-disable react-hooks/exhaustive-deps */
      clearZones(editors.theirsEditorRef.current, editors.theirsCollapsedViewZonesRef)
      clearZones(editors.centerEditorRef.current, editors.centerCollapsedViewZonesRef)
      clearZones(editors.oursEditorRef.current, editors.oursCollapsedViewZonesRef)
      clearStickyOverlays(editors.theirsEditorRef.current, 'theirs')
      clearStickyOverlays(editors.centerEditorRef.current, 'center')
      clearStickyOverlays(editors.oursEditorRef.current, 'ours')
      /* oxlint-enable react-hooks/exhaustive-deps */
    }
  }, [
    editors,
    collapseUnchanged,
    expandedBlocks,
    blocks,
    placements,
    scheduleRecompute,
    expandBlock,
    editorsReady,
    applyStickyBanners,
    createStickyOverlays,
    clearStickyOverlays,
  ])

  return {
    collapseUnchanged,
    setCollapseUnchanged,
    expandedBlocks,
    expandBlock,
    applyStickyBanners,
  }
}
