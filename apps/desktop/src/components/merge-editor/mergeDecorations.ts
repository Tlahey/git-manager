import type { MergeBlock } from '@git-manager/git-types'
import {
  type BlockPlacement,
  type ColorToken,
  changeKindForBlock,
  isChangeSource,
  sideColorToken,
  subRangeForSide,
} from './mergeBlockLayout'

/** One Monaco whole-line decoration to apply. `endLine` is INCLUSIVE (unlike the exclusive
 * `startLine + lineCount` convention used for edit ranges elsewhere): Monaco's `isWholeLine`
 * decorations treat `endLineNumber` as inclusive regardless of `endColumn`, so specs carry the
 * inclusive boundary directly instead of making the consumer remember to subtract one. */
export interface DecorationSpec {
  startLine: number
  endLine: number
  className: string
  marginClassName: string
}

/** One hatched filler zone (Monaco `IViewZone`) to inject where content is physically missing
 * from a pane: a pane showing only *part* of a block (e.g. the center after "keep both" grew
 * past each side), or a pane from which existing base content was **deleted** — WebStorm fills
 * the hole a deletion leaves with exactly this hatched gray space.
 *
 * Deliberately NOT used for a pure **insertion**: content that never existed in a pane consumes
 * no space there (WebStorm-style) — it renders as a zero-height boundary marker between two
 * lines instead (see the `merge-marker-*` decorations emitted by `addPaneBlock`), and the
 * connector ribbon funnels to that point. */
export interface ViewZoneSpec {
  id?: string
  afterLineNumber: number
  heightInLines: number
  className: string
}

/** How a pane renders a block it holds zero lines of: the intense colored boundary line (the
 * center pane, where the insertion would land), the hatched filler zone (deletions — the space
 * existed in the base and should still read as occupied), or nothing at all (a pure addition's
 * mirror pane — the side that never had, and never will have, this content: per spec it shows
 * completely untouched, undecorated code). */
type EmptyPaneRendering = 'accent-marker' | 'zone' | 'none'

/** How far the `merge-marker-*`/`merge-marker-passive-*` CSS classes (see index.css) nudge a
 * boundary marker off the real line it's decorating and onto the true inter-line boundary —
 * `ThreeWayMergeEditor.tsx`'s connector-ribbon geometry applies this exact same pixel offset to
 * whichever endpoint of a segment lands on a marker line, so the SVG ribbon's tip/flat-stroke
 * still terminates precisely on the (CSS-shifted) marker instead of drifting 1px away from it.
 * The two must stay in lockstep: bumping this constant means bumping the matching `translateY`
 * values in index.css too. */
export const MARKER_NUDGE_PX = 1

/** Every pane's own total line count, as of the last block's placement — a boundary marker past
 * the last real line needs this to know there's no "next line" to anchor a top edge to (falls
 * back to the last line's bottom edge instead). Exposed so `ThreeWayMergeEditor.tsx`'s connector
 * geometry can determine the same top/bottom edge a marker decoration would use, without
 * duplicating the "which is the tallest/last block" walk. */
export interface PaneTotalLines {
  ours: number
  center: number
  theirs: number
}

export function computePaneTotalLines(blocks: MergeBlock[], placements: Map<number, BlockPlacement>): PaneTotalLines {
  const lastBlock = blocks[blocks.length - 1]
  const lastPlacement = lastBlock ? placements.get(lastBlock.blockId) : undefined
  return {
    ours: lastBlock ? lastBlock.oursStartLine + lastBlock.oursLineCount - 1 : 0,
    theirs: lastBlock ? lastBlock.theirsStartLine + lastBlock.theirsLineCount - 1 : 0,
    center: lastPlacement ? lastPlacement.centerStartLine + lastPlacement.centerLineCount - 1 : 0,
  }
}

/** Whether a boundary marker anchored right after `afterLine` (0 if there's nothing before it)
 * lands on a real "next line" (`top` — the common case) or falls past the end of the pane's
 * content entirely (`bottom` — anchors to the last line's bottom edge instead, since there's no
 * next line to carry a top edge). Shared by `addPaneBlock`'s own marker decoration and
 * `ThreeWayMergeEditor.tsx`'s connector geometry so they agree on which edge (and therefore
 * which nudge direction) applies to the exact same marker. */
export function markerEdge(afterLine: number, paneTotalLines: number): 'top' | 'bottom' {
  const markerLine = afterLine + 1
  const total = Math.max(1, paneTotalLines)
  return markerLine <= total ? 'top' : 'bottom'
}

export interface PaneVisualSpecs {
  decorations: DecorationSpec[]
  viewZones: ViewZoneSpec[]
}

export interface MergeVisuals {
  ours: PaneVisualSpecs
  center: PaneVisualSpecs
  theirs: PaneVisualSpecs
}

/** A contiguous colored run of lines within one pane. The center pane can have two per block
 * (the ours-derived lines, then the theirs-derived lines, when both sides are included). */
interface ColoredRange {
  startLine: number
  lineCount: number
  token: ColorToken
  resolved: boolean
}

/** Splits one colored range into first/middle/last whole-line decorations so the block reads as
 * one hermetic unit (JetBrains-style): a vivid 2px border only across the very top and very
 * bottom of the block, never between its inner lines — naively putting `border-top`/`border-bottom`
 * on every line of the range would draw a horizontal grid line between each pair of lines.
 * `withTopBorder`/`withBottomBorder` let the caller suppress an edge that something else closes
 * instead (the block's other colored sub-range above it, or a filler view zone below it). The
 * border classes go on the margin decoration too, so the top/bottom edge runs across the gutter
 * as well as the code area. */
export function blockDecorationSpecs(
  startLine: number,
  lineCount: number,
  token: ColorToken,
  withTopBorder: boolean,
  withBottomBorder: boolean,
  resolved = false
): DecorationSpec[] {
  if (lineCount <= 0) return []

  const resolvedClass = resolved ? ' merge-resolved' : ''
  const text = `merge-text-${token}${resolvedClass}`
  const margin = `merge-vivid-${token}${resolvedClass}`

  // No edge to draw at all (borders disabled, or both edges closed by something else): the
  // whole range collapses into one plain decoration — no first/middle/last split needed.
  if (!withTopBorder && !withBottomBorder) {
    return [{ startLine, endLine: startLine + lineCount - 1, className: text, marginClassName: margin }]
  }

  const top = withTopBorder ? ` merge-border-top-${token}${resolvedClass}` : ''
  const bottom = withBottomBorder ? ` merge-border-bottom-${token}${resolvedClass}` : ''

  if (lineCount === 1) {
    return [
      { startLine, endLine: startLine, className: `${text}${top}${bottom}`, marginClassName: `${margin}${top}${bottom}` },
    ]
  }

  const specs: DecorationSpec[] = [
    { startLine, endLine: startLine, className: `${text}${top}`, marginClassName: `${margin}${top}` },
  ]
  if (lineCount > 2) {
    specs.push({ startLine: startLine + 1, endLine: startLine + lineCount - 2, className: text, marginClassName: margin })
  }
  const lastLine = startLine + lineCount - 1
  specs.push({ startLine: lastLine, endLine: lastLine, className: `${text}${bottom}`, marginClassName: `${margin}${bottom}` })
  return specs
}

/** Emits one pane's visuals for one block. The shape depends on how much of the block this
 * pane shows:
 *
 * - All of it (no deficit): just the colored sub-range decorations.
 * - Some of it (0 < count < tallest pane): the decorations plus a hatched filler zone for the
 *   missing height right below the content. The zone participates in the hermetic-block border:
 *   it takes over the block's bottom edge (the content's own last line stays borderless so
 *   content and zone read as one continuous unit).
 * - None of it: dispatched by `emptyRendering` (chosen per pane role and change kind by
 *   `computeMergeVisuals`) — a hatched zone (deletions keep occupying the space the base content
 *   left behind), a zero-height accent boundary marker that consumes no space at all (the
 *   CENTER pane's own rendering of a not-yet-pulled-in pure insertion: a line drawn along the
 *   top edge of the line right after the insertion point, flipped to the pane's last line's
 *   bottom edge when the insertion point sits past the end of the document — the connector
 *   ribbon, whose center anchor already collapses to a point for an absent block, funnels
 *   exactly to that line), or nothing at all (a pure addition's mirror pane — per spec, that
 *   pane and its own gap show no decoration whatsoever, just the untouched code). */
function addPaneBlock(
  pane: PaneVisualSpecs,
  parts: ColoredRange[],
  zone: {
    id?: string
    deficit: number
    afterLine: number
    token: ColorToken | undefined
    paneLineCount: number
    paneTotalLines: number
    emptyRendering: EmptyPaneRendering
    resolved: boolean
  },
  withBorders: boolean
): void {
  const isEmpty = zone.paneLineCount === 0
  const wantsMarker = zone.deficit > 0 && isEmpty && zone.emptyRendering === 'accent-marker' && zone.token !== undefined
  const wantsNothing = zone.deficit > 0 && isEmpty && zone.emptyRendering === 'none'
  const hasZone = zone.deficit > 0 && !wantsMarker && !wantsNothing

  parts.forEach((part, i) => {
    pane.decorations.push(
      ...blockDecorationSpecs(
        part.startLine,
        part.lineCount,
        part.token,
        (withBorders || part.resolved) && i === 0,
        (withBorders || part.resolved) && i === parts.length - 1 && !hasZone,
        part.resolved
      )
    )
  })

  if (wantsNothing) return

  if (wantsMarker) {
    const markerLine = zone.afterLine + 1
    const total = Math.max(1, zone.paneTotalLines)
    const edge = markerEdge(zone.afterLine, zone.paneTotalLines)
    const resolvedClass = zone.resolved ? ' merge-resolved' : ''
    const className = `merge-marker-${edge}-${zone.token}${resolvedClass}`
    const line = Math.min(markerLine, total)
    // Whole-line decoration whose only visible effect is the painted boundary edge; the same
    // class on the margin makes the line run across the line-number gutter too, like WebStorm's.
    pane.decorations.push({ startLine: line, endLine: line, className, marginClassName: className })
    return
  }

  if (hasZone) {
    const classes = ['merge-view-zone']
    // Semantic hatching, WebStorm-style: the stripes themselves say what kind of hole this is —
    // thick, widely-spaced gray for a plain deletion, thin dense red for a conflict where one
    // side removed text (see the merge-view-zone-* variants in index.css).
    if (zone.token) {
      classes.push(`merge-view-zone-${zone.token}`)
      if (zone.resolved) {
        classes.push('merge-resolved')
      }
    }
    if ((withBorders || zone.resolved) && zone.token) {
      const resolvedClass = zone.resolved ? ' merge-resolved' : ''
      classes.push(`merge-border-bottom-${zone.token}${resolvedClass}`)
      if (parts.length === 0) classes.push(`merge-border-top-${zone.token}${resolvedClass}`)
    }
    pane.viewZones.push({ id: zone.id, afterLineNumber: zone.afterLine, heightInLines: zone.deficit, className: classes.join(' ') })
  }
}

/** Derives every pane's decorations and alignment view zones from the current placements — the
 * single visual source of truth the editor re-applies wholesale after each placement change
 * (gutter action, wand, undo/redo, manual typing), mirroring how placements themselves are
 * recomputed rather than patched.
 *
 * Alignment: for each block the tallest pane (ours / center / theirs) sets the block's visual
 * height; the other panes get hatched filler zones for the difference, so the three panes stay
 * line-for-line aligned under the pixel-offset scroll sync (useMergeScrollSync) no matter how
 * the center grows/shrinks as sides are pulled in or rejected. Blocks whose three counts already
 * agree (the common case — unchanged text, or a settled one-line choice) produce no zones.
 *
 * The center zone's color: red while a genuine decision is still pending on some side, gray once
 * both sides are settled — i.e. the same touched-driven progression as the block's own fill,
 * evaluated across both sides at once since the center represents the block as a whole.
 *
 * `withBlockBorders` (off by default) adds the hermetic 2px top/bottom edges around each block
 * (and the matching closing edges on filler zones) — purely additive: fills and zones are
 * identical either way. */
function isBlockResolved(block: MergeBlock, placement: BlockPlacement): boolean {
  if (block.kind === 'ours-only') return placement.oursTouched
  if (block.kind === 'theirs-only') return placement.theirsTouched
  return placement.oursTouched && placement.theirsTouched
}

export function computeMergeVisuals(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  withBlockBorders = false
): MergeVisuals {
  const visuals: MergeVisuals = {
    ours: { decorations: [], viewZones: [] },
    center: { decorations: [], viewZones: [] },
    theirs: { decorations: [], viewZones: [] },
  }

  // Needed to clamp a boundary marker whose insertion point sits past the end of a pane (there's
  // no "next line" to carry a top edge; the last line's bottom edge is used instead).
  const { ours: oursTotalLines, theirs: theirsTotalLines, center: centerTotalLines } = computePaneTotalLines(blocks, placements)

  for (const block of blocks) {
    const placement = placements.get(block.blockId)
    if (!placement) continue

    const oursToken = isChangeSource(block, 'ours') ? sideColorToken(block, placement.oursTouched, 'ours') : undefined
    const theirsToken = isChangeSource(block, 'theirs') ? sideColorToken(block, placement.theirsTouched, 'theirs') : undefined
    const centerCount = placement.centerLineCount
    const maxCount = Math.max(block.oursLineCount, block.theirsLineCount, centerCount)

    // WebStorm's decoration matrix for a pane that holds zero lines of a block: a pure
    // insertion consumes no space anywhere it's absent — the center (the target the content
    // would land in) gets the intense colored boundary line, and the opposite/mirror pane gets
    // NO decoration at all (per spec: untouched code, nothing in its own gap either — see the
    // matching skip in ThreeWayMergeEditor.tsx's `recomputeConnectors`). Everything else
    // (deletions, one-side-deleted conflicts, a center whose sides were both rejected) keeps
    // the hatched filler zone: that space existed in the base and should still read as occupied.
    const isPureInsertion = changeKindForBlock(block) === 'addition'
    const sideEmptyRendering: EmptyPaneRendering = isPureInsertion ? 'none' : 'accent-marker'
    const centerEmptyRendering: EmptyPaneRendering = isPureInsertion ? 'accent-marker' : 'zone'

    const resolved = isBlockResolved(block, placement)
    const oursDeficit = block.oursLineCount === 0 ? 1 : 0
    const theirsDeficit = block.theirsLineCount === 0 ? 1 : 0

    const oursParts: ColoredRange[] =
      oursToken && block.oursLineCount > 0
        ? [{ startLine: block.oursStartLine, lineCount: block.oursLineCount, token: oursToken, resolved: placement.oursTouched }]
        : []
    addPaneBlock(visuals.ours, oursParts, {
      id: `${block.blockId}-ours`,
      deficit: oursDeficit,
      afterLine: block.oursLineCount === 0 ? block.oursStartLine - 1 : block.oursStartLine + block.oursLineCount - 1,
      token: oursToken,
      paneLineCount: block.oursLineCount,
      paneTotalLines: oursTotalLines,
      emptyRendering: sideEmptyRendering,
      resolved: placement.oursTouched,
    }, withBlockBorders)

    const theirsParts: ColoredRange[] =
      theirsToken && block.theirsLineCount > 0
        ? [{ startLine: block.theirsStartLine, lineCount: block.theirsLineCount, token: theirsToken, resolved: placement.theirsTouched }]
        : []
    addPaneBlock(visuals.theirs, theirsParts, {
      id: `${block.blockId}-theirs`,
      deficit: theirsDeficit,
      afterLine: block.theirsLineCount === 0 ? block.theirsStartLine - 1 : block.theirsStartLine + block.theirsLineCount - 1,
      token: theirsToken,
      paneLineCount: block.theirsLineCount,
      paneTotalLines: theirsTotalLines,
      emptyRendering: sideEmptyRendering,
      resolved: placement.theirsTouched,
    }, withBlockBorders)

    const baseOursToken = sideColorToken(block, placement.oursTouched)
    const baseTheirsToken = sideColorToken(block, placement.theirsTouched)

    const centerParts: ColoredRange[] = []
    if (placement.oursIncluded && baseOursToken) {
      const { start, count } = subRangeForSide(placement, block, 'ours')
      if (count > 0) centerParts.push({ startLine: start, lineCount: count, token: baseOursToken, resolved: placement.oursTouched })
    }
    if (placement.theirsIncluded && baseTheirsToken) {
      const { start, count } = subRangeForSide(placement, block, 'theirs')
      if (count > 0) centerParts.push({ startLine: start, lineCount: count, token: baseTheirsToken, resolved: placement.theirsTouched })
    }
    const isDeletion = changeKindForBlock(block) === 'deletion'
    const centerDeficit = changeKindForBlock(block) === 'addition'
      ? maxCount - centerCount
      : (isDeletion && resolved && centerCount === 0 ? 1 : 0)
    const resolvedCenterEmptyRendering = isDeletion && resolved && centerCount === 0
      ? 'accent-marker'
      : centerEmptyRendering

    addPaneBlock(visuals.center, centerParts, {
      deficit: centerDeficit,
      afterLine: placement.centerStartLine + centerCount - 1,
      token: sideColorToken(block, placement.oursTouched && placement.theirsTouched),
      paneLineCount: centerCount,
      paneTotalLines: centerTotalLines,
      emptyRendering: resolvedCenterEmptyRendering,
      resolved,
    }, withBlockBorders)
  }

  return visuals
}
