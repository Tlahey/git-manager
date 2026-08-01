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
  domNode: HTMLDivElement
}

interface UseCollapseUnchangedParams {
  editors: MergeEditorRefs
  blocks: MergeBlock[]
  placements: Map<number, BlockPlacement>
  scheduleRecompute: () => void
  defaultCollapseUnchanged: boolean
  /** Flips to `true` once every pane's Monaco instance has mounted. The `editors` bundle is a
   * stable ref object, so mutating its `.current` handles never re-triggers the apply effect on
   * its own — without this flag in the deps, the effect's first (and, with static `blocks`/
   * `placements`, only) run happens while the editor refs are still `null` and silently no-ops,
   * leaving the panes uncollapsed until some unrelated dependency change happens to re-run it. */
  editorsReady: boolean
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
  editorsReady,
}: UseCollapseUnchangedParams) {
  const [collapseUnchanged, setCollapseUnchanged] = useState(defaultCollapseUnchanged)
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set())

  // Every currently-live banner's line-anchor info, keyed by pane — read by applyStickyBanners
  // on each scroll tick. Line numbers, not pixel positions: Monaco resets a view zone's own
  // `top` to 0 whenever its internal viewport culling considers the zone "not visible" (exactly
  // the zones we care about, scrolled just past the top edge), so naturalTop is recomputed fresh
  // from `getTopForLineNumber` every time instead of cached from view-zone DOM state.
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
        const domNode = document.createElement('div')
        domNode.className = 'monaco-collapsed-zone-banner'
        domNode.style.pointerEvents = 'auto'
        // The overlay widget layer only ever sets `top`/`left`/`position` from getPosition()
        // (once, at addOverlayWidget time) — `right` is ours to own, giving the banner the same
        // full-width span (viewport width here, not document scroll width) as a real fold line.
        domNode.style.right = '0'
        domNode.setAttribute('data-collapsed-block-id', String(info.blockId))

        const label = document.createElement('span')
        label.className = 'monaco-collapsed-zone-banner-label'
        label.textContent = `${info.collapsedCount} lines collapsed`
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

        const widget: editor.IOverlayWidget = {
          getId: () => `merge-editor-collapsed-banner-${key}-${info.blockId}`,
          getDomNode: () => domNode,
          getPosition: () => ({ preference: { top: 0, left: 0 } }),
        }
        paneEditor.addOverlayWidget(widget)
        overlays.set(info.blockId, { widget, domNode })
      })
    },
    [expandBlock]
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

        let naturalTop: number
        try {
          // `afterLineNumber` is always the last visible context line right before the hidden
          // range, never a hidden line itself, so the "throws for hidden lines" caveat on
          // Monaco's own getTopForLineNumber (see editorGeometry.ts) doesn't apply here — still
          // guarded since this runs on every scroll tick and a transient exception shouldn't
          // break scrolling.
          naturalTop = paneEditor.getTopForLineNumber(info.afterLineNumber) + lineHeight
        } catch {
          return
        }

        const correction = stickyTopCorrection(scrollTop, naturalTop, bannerHeight)
        overlay.domNode.style.top = `${naturalTop - scrollTop + correction}px`
        // Unlike a view zone (which Monaco sizes itself via `setHeight`), an overlay widget's
        // height is left entirely to its own CSS/content — without this, the banner's wave
        // decoration (centered within its own box via `align-items: center`) collapses to
        // whatever height the label's opacity-0 text naturally takes, landing at a different Y
        // than the connector wave's midpoint (computed from this same `bannerHeight`) expects,
        // which reads as a small vertical seam between the two.
        overlay.domNode.style.height = `${bannerHeight}px`
      })
    }

    pinPane(editors.theirsEditorRef.current, 'theirs', bannerInfoRef.current.theirs)
    pinPane(centerEditor, 'center', bannerInfoRef.current.center)
    pinPane(editors.oursEditorRef.current, 'ours', bannerInfoRef.current.ours)
  }, [editors])

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

    // Monaco's layout takes a moment to update line height mappings after setHiddenAreas — the
    // sticky pin re-applies alongside each recompute so it uses the settled layout once available.
    scheduleRecompute()
    applyStickyBanners()
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
      clearZones(editors.theirsEditorRef.current, editors.theirsCollapsedViewZonesRef)
      clearZones(editors.centerEditorRef.current, editors.centerCollapsedViewZonesRef)
      clearZones(editors.oursEditorRef.current, editors.oursCollapsedViewZonesRef)
      clearStickyOverlays(editors.theirsEditorRef.current, 'theirs')
      clearStickyOverlays(editors.centerEditorRef.current, 'center')
      clearStickyOverlays(editors.oursEditorRef.current, 'ours')
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
