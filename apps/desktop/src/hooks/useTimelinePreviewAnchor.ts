import { useEffect, useRef } from 'react'
import type { GitGraphNode } from '@git-manager/git-types'

/**
 * Brings the previewed commit to a fixed place on screen each time the timeline moves to a new
 * step, so scrubbing has a reference point.
 *
 * Without one, every step shifts the whole list under a stationary viewport, and "the rows moved
 * up" is indistinguishable from "the list scrolled down" — which is what made the first attempt at
 * animating the change unreadable. Anchoring the commit HEAD would land on turns the question into
 * a legible one: it stays put, and what changes is the history around it.
 *
 * Fires once per step, not once per render: the previewed log arrives a moment after the step is
 * picked, so the effect re-runs as the list changes but only acts when it finally contains the
 * commit it is waiting for. Re-scrolling on every list update would fight the user's own scrolling.
 */
export function useTimelinePreviewAnchor({
  active,
  previewOid,
  filteredNodes,
  scrollToIndex,
}: {
  /** The timeline is open for this repo. */
  active: boolean
  /** Commit the previewed step lands HEAD on — `null` for a step that moves no HEAD. */
  previewOid: string | null
  /** The rows on screen, which is what an index passed to `scrollToIndex` addresses. */
  filteredNodes: GitGraphNode[]
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' }) => void
}) {
  const anchoredOid = useRef<string | null>(null)

  useEffect(() => {
    if (!active) {
      // Closing hands scrolling back to the user; the next opening re-anchors from scratch.
      anchoredOid.current = null
      return
    }
    if (!previewOid || anchoredOid.current === previewOid) return
    const index = filteredNodes.findIndex((n) => n.commit.oid === previewOid)
    // Not there yet — the previewed log is still loading. Leave the anchor unclaimed so this runs
    // again when it lands, rather than giving up on the step.
    if (index === -1) return
    anchoredOid.current = previewOid
    scrollToIndex(index, { align: 'center' })
  }, [active, previewOid, filteredNodes, scrollToIndex])
}
