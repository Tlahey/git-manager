import type { MergeBlock } from '@git-manager/git-types'
import {
  type BlockPlacement,
  type ColorToken,
  changeKindForBlock,
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
  afterLineNumber: number
  heightInLines: number
  className: string
}

/** How a pane renders a block it holds zero lines of: the intense colored boundary line (the
 * center pane, where the insertion would land), the thin neutral alignment line (the opposite
 * source pane, a passive observer of a one-sided insertion), or the hatched filler zone
 * (deletions — the space existed in the base and should still read as occupied). */
type EmptyPaneRendering = 'accent-marker' | 'passive-marker' | 'zone'

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
  withBottomBorder: boolean
): DecorationSpec[] {
  if (lineCount <= 0) return []

  const text = `merge-text-${token}`
  const margin = `merge-vivid-${token}`

  // No edge to draw at all (borders disabled, or both edges closed by something else): the
  // whole range collapses into one plain decoration — no first/middle/last split needed.
  if (!withTopBorder && !withBottomBorder) {
    return [{ startLine, endLine: startLine + lineCount - 1, className: text, marginClassName: margin }]
  }

  const top = withTopBorder ? ` merge-border-top-${token}` : ''
  const bottom = withBottomBorder ? ` merge-border-bottom-${token}` : ''

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
 *   `computeMergeVisuals`) — either a hatched zone (deletions keep occupying the space the base
 *   content left behind), or a zero-height boundary marker that consumes no space at all
 *   (WebStorm's pure-insertion rendering): a line drawn along the top edge of the line right
 *   after the insertion point (`merge-marker-top-*` — intense and token-colored for the accent
 *   variant, thin and neutral for the passive one), flipped to the pane's last line's bottom
 *   edge when the insertion point sits past the end of the document. The connector ribbon
 *   (whose center anchor already collapses to a point for an absent block — see
 *   `connectorCenterRangeForSide`) funnels exactly to that line. */
function addPaneBlock(
  pane: PaneVisualSpecs,
  parts: ColoredRange[],
  zone: {
    deficit: number
    afterLine: number
    token: ColorToken | undefined
    paneLineCount: number
    paneTotalLines: number
    emptyRendering: EmptyPaneRendering
  },
  withBorders: boolean
): void {
  const wantsMarker =
    zone.deficit > 0 &&
    zone.paneLineCount === 0 &&
    (zone.emptyRendering === 'passive-marker' || (zone.emptyRendering === 'accent-marker' && zone.token !== undefined))
  const hasZone = zone.deficit > 0 && !wantsMarker

  parts.forEach((part, i) => {
    pane.decorations.push(
      ...blockDecorationSpecs(
        part.startLine,
        part.lineCount,
        part.token,
        withBorders && i === 0,
        withBorders && i === parts.length - 1 && !hasZone
      )
    )
  })

  if (wantsMarker) {
    const markerLine = zone.afterLine + 1
    const total = Math.max(1, zone.paneTotalLines)
    const edge = markerLine <= total ? 'top' : 'bottom'
    const className =
      zone.emptyRendering === 'passive-marker' ? `merge-marker-passive-${edge}` : `merge-marker-${edge}-${zone.token}`
    const line = Math.min(markerLine, total)
    // Whole-line decoration whose only visible effect is the painted boundary edge; the same
    // class on the margin makes the line run across the line-number gutter too, like WebStorm's.
    pane.decorations.push({ startLine: line, endLine: line, className, marginClassName: className })
    return
  }

  if (hasZone) {
    const classes = ['merge-view-zone']
    if (withBorders && zone.token) {
      classes.push(`merge-border-bottom-${zone.token}`)
      if (parts.length === 0) classes.push(`merge-border-top-${zone.token}`)
    }
    pane.viewZones.push({ afterLineNumber: zone.afterLine, heightInLines: zone.deficit, className: classes.join(' ') })
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

  // Blocks tile each document in order, so each pane's total line count falls out of its last
  // block/placement — needed to clamp a boundary marker whose insertion point sits past the end
  // of a pane (there's no "next line" to carry a top edge; the last line's bottom edge is used).
  const lastBlock = blocks[blocks.length - 1]
  const lastPlacement = lastBlock ? placements.get(lastBlock.blockId) : undefined
  const oursTotalLines = lastBlock ? lastBlock.oursStartLine + lastBlock.oursLineCount - 1 : 0
  const theirsTotalLines = lastBlock ? lastBlock.theirsStartLine + lastBlock.theirsLineCount - 1 : 0
  const centerTotalLines = lastPlacement ? lastPlacement.centerStartLine + lastPlacement.centerLineCount - 1 : 0

  for (const block of blocks) {
    const placement = placements.get(block.blockId)
    if (!placement) continue

    const oursToken = sideColorToken(block, placement.oursTouched)
    const theirsToken = sideColorToken(block, placement.theirsTouched)
    const centerCount = placement.centerLineCount
    const maxCount = Math.max(block.oursLineCount, block.theirsLineCount, centerCount)

    // WebStorm's decoration matrix for a pane that holds zero lines of a block: a pure
    // insertion consumes no space anywhere it's absent — the center (the target the content
    // would land in) gets the intense colored boundary line, the opposite source pane (a
    // passive observer) gets the thin neutral alignment line. Everything else (deletions,
    // one-side-deleted conflicts, a center whose sides were both rejected) keeps the hatched
    // filler zone: that space existed in the base and should still read as occupied.
    const isPureInsertion = changeKindForBlock(block) === 'addition'
    const sideEmptyRendering: EmptyPaneRendering = isPureInsertion ? 'passive-marker' : 'zone'
    const centerEmptyRendering: EmptyPaneRendering = isPureInsertion ? 'accent-marker' : 'zone'

    const oursParts: ColoredRange[] =
      oursToken && block.oursLineCount > 0
        ? [{ startLine: block.oursStartLine, lineCount: block.oursLineCount, token: oursToken }]
        : []
    addPaneBlock(visuals.ours, oursParts, {
      deficit: maxCount - block.oursLineCount,
      afterLine: block.oursStartLine + block.oursLineCount - 1,
      token: oursToken,
      paneLineCount: block.oursLineCount,
      paneTotalLines: oursTotalLines,
      emptyRendering: sideEmptyRendering,
    }, withBlockBorders)

    const theirsParts: ColoredRange[] =
      theirsToken && block.theirsLineCount > 0
        ? [{ startLine: block.theirsStartLine, lineCount: block.theirsLineCount, token: theirsToken }]
        : []
    addPaneBlock(visuals.theirs, theirsParts, {
      deficit: maxCount - block.theirsLineCount,
      afterLine: block.theirsStartLine + block.theirsLineCount - 1,
      token: theirsToken,
      paneLineCount: block.theirsLineCount,
      paneTotalLines: theirsTotalLines,
      emptyRendering: sideEmptyRendering,
    }, withBlockBorders)

    const centerParts: ColoredRange[] = []
    if (placement.oursIncluded && oursToken) {
      const { start, count } = subRangeForSide(placement, block, 'ours')
      if (count > 0) centerParts.push({ startLine: start, lineCount: count, token: oursToken })
    }
    if (placement.theirsIncluded && theirsToken) {
      const { start, count } = subRangeForSide(placement, block, 'theirs')
      if (count > 0) centerParts.push({ startLine: start, lineCount: count, token: theirsToken })
    }
    addPaneBlock(visuals.center, centerParts, {
      deficit: maxCount - centerCount,
      afterLine: placement.centerStartLine + centerCount - 1,
      token: sideColorToken(block, placement.oursTouched && placement.theirsTouched),
      paneLineCount: centerCount,
      paneTotalLines: centerTotalLines,
      emptyRendering: centerEmptyRendering,
    }, withBlockBorders)
  }

  return visuals
}
