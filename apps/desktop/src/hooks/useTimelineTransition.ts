import { useEffect, useRef, useState } from 'react'
import type { GitGraphNode } from '@git-manager/git-types'

/**
 * How long the graph waits before swapping lists, and before it stops marking arrivals. Both sit
 * just above the 200ms `animate-duration-200` the rows are given, so an animation always finishes
 * before the thing it is animating is taken away.
 */
export const TIMELINE_EXIT_MS = 220
export const TIMELINE_ENTER_MS = 220

const NO_OIDS: ReadonlySet<string> = new Set()

export interface TimelineTransition {
  /** The nodes to render — the *previous* list while departing commits are still animating out. */
  displayedNodes: GitGraphNode[]
  /** Commits on their way out: still rendered, collapsing away. */
  exitingOids: ReadonlySet<string>
  /** Commits the step just introduced, fading in. */
  enteringOids: ReadonlySet<string>
}

function oidsOf(nodes: GitGraphNode[]): Set<string> {
  return new Set(nodes.map((n) => n.commit.oid))
}

/**
 * Holds the graph on the previous history just long enough for the commits a timeline step removes
 * to be seen leaving, then swaps to the new one.
 *
 * Animating the *departure* is the whole point, and it is why this has to defer the swap rather
 * than decorate the result: once the previewed log lands those commits are simply not in it, so
 * there is nothing left to animate. Keeping them in a shadow list positioned by their old offsets
 * would be the other way to do it, and a worse one — the coordinate space moves under them (the
 * rows above the previewed HEAD end up at negative offsets, outside the scroll area), so they
 * would have to be re-projected into a list they are no longer part of.
 *
 * Nothing else moves during the transition. `useTimelinePreviewAnchor` keeps the previewed commit
 * at a fixed place on screen, and removing rows above it shifts every survivor's offset by exactly
 * the amount the anchor scrolls back — so the survivors are visually static and the only motion on
 * screen is the one that carries the meaning. That is the difference from the first attempt, where
 * everything slid by the same amount at once and none of it read.
 *
 * Inert while `active` is false: the displayed list is the real one, both sets are empty, and no
 * timer is ever armed. The graph outside the timeline is untouched.
 */
export function useTimelineTransition({
  active,
  nodes,
}: {
  active: boolean
  nodes: GitGraphNode[]
}): TimelineTransition {
  const [displayedNodes, setDisplayedNodes] = useState(nodes)
  const [exitingOids, setExitingOids] = useState<ReadonlySet<string>>(NO_OIDS)
  const [enteringOids, setEnteringOids] = useState<ReadonlySet<string>>(NO_OIDS)

  // The list actually on screen, read inside the effect without making it a dependency — the
  // effect is what sets it, and depending on it would re-run the transition against its own output.
  const displayedRef = useRef(nodes)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const clearTimers = () => {
      for (const id of timers.current) window.clearTimeout(id)
      timers.current = []
    }

    const show = (next: GitGraphNode[], entering: ReadonlySet<string>) => {
      displayedRef.current = next
      setDisplayedNodes(next)
      setExitingOids(NO_OIDS)
      setEnteringOids(entering)
      if (entering.size > 0) {
        timers.current.push(window.setTimeout(() => setEnteringOids(NO_OIDS), TIMELINE_ENTER_MS))
      }
    }

    if (!active) {
      // Opening and closing must not animate: the step the timeline opens on is the current one,
      // so there is nothing leaving, and closing is a return to the history already on screen.
      clearTimers()
      show(nodes, NO_OIDS)
      return
    }
    if (nodes === displayedRef.current) return

    const current = oidsOf(displayedRef.current)
    const next = oidsOf(nodes)
    const departing = new Set([...current].filter((oid) => !next.has(oid)))
    const arriving = new Set([...next].filter((oid) => !current.has(oid)))

    // A step that only adds commits has nothing to wait for.
    if (departing.size === 0) {
      clearTimers()
      show(nodes, arriving)
      return
    }

    // Scrubbing faster than the animation: land the pending step at once rather than queue, so the
    // graph is never more than one transition behind the scrubber.
    clearTimers()
    setExitingOids(departing)
    timers.current.push(window.setTimeout(() => show(nodes, arriving), TIMELINE_EXIT_MS))
  }, [active, nodes])

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id)
      timers.current = []
    },
    []
  )

  return { displayedNodes, exitingOids, enteringOids }
}
