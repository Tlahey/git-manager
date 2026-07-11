import { useCallback, useEffect, useState, type MutableRefObject } from 'react'
import type { editor, IRange } from 'monaco-editor'
import type { MergeBlock } from '../../types'
import type { BlockPlacement } from '../../mergeBlockLayout'
import { setHiddenAreas } from '../monacoInterop'
import { collapsedRegionsForPane, setCollapsedBlockHover } from '../collapsedRegions'
import { COLLAPSED_BANNER_HEIGHT_LINES } from '../../mergeViewConfig'
import type { MergeEditorRefs } from './useMergeEditorRefs'

interface UseCollapseUnchangedParams {
  editors: MergeEditorRefs
  blocks: MergeBlock[]
  placements: Map<number, BlockPlacement>
  scheduleRecompute: () => void
  defaultCollapseUnchanged: boolean
}

/** The collapse-unchanged feature: hides the middle of long unchanged blocks in every pane via
 * Monaco's (private) `setHiddenAreas` API and injects clickable "N lines collapsed" banner view
 * zones where the hidden lines used to be. Clicking a banner (or the connector wave — see
 * `onExpandBlock`) expands that one block; toggling the feature off restores everything and
 * resets the per-block expansions. */
export function useCollapseUnchanged({
  editors,
  blocks,
  placements,
  scheduleRecompute,
  defaultCollapseUnchanged,
}: UseCollapseUnchangedParams) {
  const [collapseUnchanged, setCollapseUnchanged] = useState(defaultCollapseUnchanged)
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set())

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

  // Apply collapseUnchanged regions to standard Monaco editors using hiddenAreas API and custom view zones
  useEffect(() => {
    const theirsEditor = editors.theirsEditorRef.current
    const centerEditor = editors.centerEditorRef.current
    const oursEditor = editors.oursEditorRef.current

    // Clean up previous view zones
    const clearZones = (paneEditor: editor.IStandaloneCodeEditor | null, zoneIdsRef: MutableRefObject<string[]>) => {
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

    if (!collapseUnchanged || !editors.monacoRef.current) {
      setHiddenAreas(theirsEditor, [])
      setHiddenAreas(centerEditor, [])
      setHiddenAreas(oursEditor, [])
      scheduleRecompute()
      return
    }

    const monacoInstance = editors.monacoRef.current

    const regionsFor = (side: 'ours' | 'theirs' | 'center') =>
      collapsedRegionsForPane(blocks, placements, expandedBlocks, side)
    const toMonacoHidden = (regions: ReturnType<typeof regionsFor>): IRange[] =>
      regions.map((r) => new monacoInstance.Range(r.startHide, 1, r.endHide, 1))
    const toZonesToAdd = (regions: ReturnType<typeof regionsFor>) =>
      regions.map((r) => ({ afterLineNumber: r.startHide - 1, collapsedCount: r.collapsedCount, blockId: r.blockId }))

    const theirsRegions = regionsFor('theirs')
    const oursRegions = regionsFor('ours')
    const centerRegions = regionsFor('center')

    setHiddenAreas(theirsEditor, toMonacoHidden(theirsRegions))
    setHiddenAreas(centerEditor, toMonacoHidden(centerRegions))
    setHiddenAreas(oursEditor, toMonacoHidden(oursRegions))

    // Create banner DOM nodes and add view zones
    const createBannerNode = (collapsedCount: number, blockId: number, isMargin: boolean) => {
      const domNode = document.createElement('div')
      domNode.className = 'monaco-collapsed-zone-banner'
      domNode.style.pointerEvents = 'auto'
      domNode.setAttribute('data-collapsed-block-id', String(blockId))

      // The margin copy is just the narrow gutter sliver — no room for a label there, so only
      // the full-width main copy gets one. Shown on hover (see .monaco-collapsed-zone-banner-
      // label in styles.css) rather than as a native `title`, which only appears after the
      // browser's own hover delay.
      if (!isMargin) {
        const label = document.createElement('span')
        label.className = 'monaco-collapsed-zone-banner-label'
        label.textContent = `${collapsedCount} lines collapsed`
        domNode.appendChild(label)
      }

      const onTrigger = (e: MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        expandBlock(blockId)
      }

      // Add listeners with capture to handle before Monaco intercepts
      domNode.addEventListener('mousedown', onTrigger, true)
      domNode.addEventListener('click', onTrigger, true)

      // Add hover sync listeners
      domNode.addEventListener('mouseenter', () => setCollapsedBlockHover(blockId, true))
      domNode.addEventListener('mouseleave', () => setCollapsedBlockHover(blockId, false))

      return domNode
    }

    const addBannerZones = (
      paneEditor: editor.IStandaloneCodeEditor | null,
      zonesToAdd: Array<{ afterLineNumber: number; collapsedCount: number; blockId: number }>,
      zoneIdsRef: MutableRefObject<string[]>
    ) => {
      if (!paneEditor || zonesToAdd.length === 0) return
      paneEditor.changeViewZones((accessor) => {
        zonesToAdd.forEach((zone) => {
          const id = accessor.addZone({
            afterLineNumber: zone.afterLineNumber,
            heightInLines: COLLAPSED_BANNER_HEIGHT_LINES,
            domNode: createBannerNode(zone.collapsedCount, zone.blockId, false),
            marginDomNode: createBannerNode(zone.collapsedCount, zone.blockId, true),
            showInHiddenAreas: true,
            suppressMouseDown: true,
          })
          zoneIdsRef.current.push(id)
        })
      })
    }

    addBannerZones(theirsEditor, toZonesToAdd(theirsRegions), editors.theirsCollapsedViewZonesRef)
    addBannerZones(centerEditor, toZonesToAdd(centerRegions), editors.centerCollapsedViewZonesRef)
    addBannerZones(oursEditor, toZonesToAdd(oursRegions), editors.oursCollapsedViewZonesRef)

    // Monaco's layout takes a moment to update line height mappings after setHiddenAreas
    scheduleRecompute()
    const t1 = setTimeout(() => scheduleRecompute(), 50)
    const t2 = setTimeout(() => scheduleRecompute(), 150)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearZones(editors.theirsEditorRef.current, editors.theirsCollapsedViewZonesRef)
      clearZones(editors.centerEditorRef.current, editors.centerCollapsedViewZonesRef)
      clearZones(editors.oursEditorRef.current, editors.oursCollapsedViewZonesRef)
    }
  }, [editors, collapseUnchanged, expandedBlocks, blocks, placements, scheduleRecompute, expandBlock])

  return { collapseUnchanged, setCollapseUnchanged, expandedBlocks, expandBlock }
}
