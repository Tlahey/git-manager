import type { MergeBlock } from '@git-manager/git-types'

export type MergeSide = 'ours' | 'theirs'

/** Each side of a block is included/excluded from the center buffer independently — accepting
 * ours does NOT exclude theirs and vice versa, so a block can end up with both sides' content in
 * the final result (e.g. keeping an old line *and* the new one), matching how a real 3-way merge
 * tool is expected to work. `oursTouched`/`theirsTouched` track whether the user has explicitly
 * made a decision for that side yet (drives gray/"settled" coloring); `oursIncluded`/
 * `theirsIncluded` track the actual current decision (drives what's in the center buffer). */
export interface BlockPlacement {
  blockId: number
  centerStartLine: number // 1-based
  centerLineCount: number
  oursIncluded: boolean
  theirsIncluded: boolean
  oursTouched: boolean
  theirsTouched: boolean
}

function isAutoMerged(block: MergeBlock): boolean {
  return block.kind === 'unchanged' || block.kind === 'both-same'
}

/** The center buffer always starts as plain, natural text — exactly `oursText` (every block's
 * `ours_lines` concatenated), never conflict-marker syntax — so `ours` is included and `theirs`
 * is not, by default, until the user explicitly pulls theirs in. */
function defaultFlags(): Pick<BlockPlacement, 'oursIncluded' | 'theirsIncluded' | 'oursTouched' | 'theirsTouched'> {
  return { oursIncluded: true, theirsIncluded: false, oursTouched: false, theirsTouched: false }
}

function sideLines(block: MergeBlock, side: MergeSide): string[] {
  return side === 'ours' ? block.oursLines : block.theirsLines
}

function sideLineCount(block: MergeBlock, side: MergeSide, included: boolean): number {
  if (!included) return 0
  return side === 'ours' ? block.oursLineCount : block.theirsLineCount
}

function centerLineCountFor(
  block: MergeBlock,
  flags: Pick<BlockPlacement, 'oursIncluded' | 'theirsIncluded'>
): number {
  return sideLineCount(block, 'ours', flags.oursIncluded) + sideLineCount(block, 'theirs', flags.theirsIncluded)
}

type PlacementFlags = Pick<BlockPlacement, 'oursIncluded' | 'theirsIncluded' | 'oursTouched' | 'theirsTouched'>

/** Walks blocks in order, accumulating line counts, so each block's starting line in the
 * center buffer is known without re-parsing the buffer itself. `overrides` lets the magic-wand
 * recompute reuse this for a full pass instead of duplicating the walk. */
export function recomputeAllPlacements(
  blocks: MergeBlock[],
  overrides?: Map<number, PlacementFlags>
): Map<number, BlockPlacement> {
  const placements = new Map<number, BlockPlacement>()
  let line = 1
  for (const block of blocks) {
    const flags = overrides?.get(block.blockId) ?? defaultFlags()
    const centerLineCount = centerLineCountFor(block, flags)
    placements.set(block.blockId, { blockId: block.blockId, centerStartLine: line, centerLineCount, ...flags })
    line += centerLineCount
  }
  return placements
}

export function computeInitialPlacements(blocks: MergeBlock[]): Map<number, BlockPlacement> {
  return recomputeAllPlacements(blocks)
}

/** Where one side's content currently sits within a block's center range — ours (if included)
 * always comes first, theirs (if included) right after, matching the center buffer's default
 * seed order. `count` is 0 (a "pinched" zero-length range at the boundary) when that side isn't
 * currently included — used both for building edits (insert-at-point) and for collapsing that
 * side's connector ribbon to a point in the gap rather than hiding it outright. */
export function subRangeForSide(
  placement: BlockPlacement,
  block: MergeBlock,
  side: MergeSide
): { start: number; count: number } {
  const oursCount = sideLineCount(block, 'ours', placement.oursIncluded)
  if (side === 'ours') return { start: placement.centerStartLine, count: oursCount }
  return { start: placement.centerStartLine + oursCount, count: sideLineCount(block, 'theirs', placement.theirsIncluded) }
}

/** Where a side's connector ribbon should anchor on the center-buffer end. When that side *is*
 * included, this is exactly its own sub-range (`subRangeForSide`) — full height, matching its
 * own content. When it's NOT included, pinching to a zero-height point (as `subRangeForSide`
 * does, for edit-building purposes) would make a one-sided modification or a real conflict look
 * shaped exactly like a pure addition — misleading, since there usually *is* content sitting in
 * the center right now (the other side's), which this side's content would replace. So: anchor
 * to the block's whole occupied range instead, spanning whatever *is* currently shown. Only
 * collapses to a genuine point when the block is truly empty in the center (both sides excluded,
 * or a pure addition that hasn't been pulled in yet) — the one case where a point is correct. */
export function connectorCenterRangeForSide(
  placement: BlockPlacement,
  block: MergeBlock,
  side: MergeSide
): { start: number; count: number } {
  const included = side === 'ours' ? placement.oursIncluded : placement.theirsIncluded
  if (included) return subRangeForSide(placement, block, side)
  return { start: placement.centerStartLine, count: placement.centerLineCount }
}

export function linesForSide(block: MergeBlock, side: MergeSide, included: boolean): string[] {
  return included ? sideLines(block, side) : []
}

/** Applies one side's new inclusion decision and shifts every later block's `centerStartLine`
 * by the resulting delta. `blocks` must be in `blockId` order (true here — the server assigns
 * ids in document order). */
export function updatePlacementAfterToggle(
  placements: Map<number, BlockPlacement>,
  blocks: MergeBlock[],
  block: MergeBlock,
  side: MergeSide,
  included: boolean
): Map<number, BlockPlacement> {
  const current = placements.get(block.blockId)
  if (!current) return placements

  const updated: BlockPlacement =
    side === 'ours' ? { ...current, oursIncluded: included, oursTouched: true } : { ...current, theirsIncluded: included, theirsTouched: true }
  const newCenterLineCount = centerLineCountFor(block, updated)
  const delta = newCenterLineCount - current.centerLineCount
  updated.centerLineCount = newCenterLineCount

  const next = new Map(placements)
  next.set(block.blockId, updated)

  if (delta !== 0) {
    for (const b of blocks) {
      if (b.blockId <= block.blockId) continue
      const placement = next.get(b.blockId)
      if (!placement) continue
      next.set(b.blockId, { ...placement, centerStartLine: placement.centerStartLine + delta })
    }
  }
  return next
}

const MAX_FORWARD_SCAN_LINES = 20000

/** Re-derives every block's live placement directly from the center buffer's actual current
 * content, instead of guessing which single block absorbed a net line-count delta. Fixes a
 * real bug in the delta-attribution approach: a manual edit that shifts block boundaries
 * without changing the *total* line count (or lands mid-block in a way the cursor-position
 * heuristic misattributes) would silently desync gutter widgets/colors from the actual text,
 * making them look "lost" after enough typing. This runs a straightforward match-forward scan
 * per block instead: check whether the buffer at the current cursor position holds ours-then-
 * theirs (both included), just ours, or just theirs; if none of those match, the user made a
 * free-form edit — scan forward (bounded) for wherever a *later* block's known content resumes,
 * and treat everything up to that point as this block's (now custom) content. */
export function deriveLivePlacements(
  getLineText: (lineNumber: number) => string,
  totalLines: number,
  blocks: MergeBlock[],
  previousPlacements: Map<number, BlockPlacement>
): Map<number, BlockPlacement> {
  const matchesAt = (candidate: string[], at: number): boolean => {
    if (candidate.length === 0) return false // handled as its own case, not a generic "match"
    if (at + candidate.length - 1 > totalLines) return false
    for (let i = 0; i < candidate.length; i++) {
      if (getLineText(at + i) !== candidate[i]) return false
    }
    return true
  }

  const placements = new Map<number, BlockPlacement>()
  let cursor = 1

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx]
    const auto = isAutoMerged(block)
    const prev = previousPlacements.get(block.blockId)
    const prevOursIncluded = prev?.oursIncluded ?? true
    const prevTheirsIncluded = prev?.theirsIncluded ?? false
    const prevOursTouched = prev?.oursTouched ?? false
    const prevTheirsTouched = prev?.theirsTouched ?? false

    const oursMatchesHere = matchesAt(block.oursLines, cursor)
    const bothMatchHere = oursMatchesHere && matchesAt(block.theirsLines, cursor + block.oursLines.length)
    const theirsMatchesHere = matchesAt(block.theirsLines, cursor)

    let oursIncluded: boolean
    let theirsIncluded: boolean
    let consumed: number

    if (bothMatchHere) {
      oursIncluded = true
      theirsIncluded = true
      consumed = block.oursLines.length + block.theirsLines.length
    } else if (oursMatchesHere) {
      oursIncluded = true
      theirsIncluded = false
      consumed = block.oursLines.length
    } else if (theirsMatchesHere) {
      oursIncluded = false
      theirsIncluded = true
      consumed = block.theirsLines.length
    } else {
      // Free-form edit (or excluding both sides entirely): find where a later block's known
      // content next resumes, bounded so a large file with no further recognizable match
      // doesn't scan forever. Everything between `cursor` and that point belongs to this block
      // now; can't attribute a hand-edited range to a specific side, so it's treated as a
      // (touched) stand-in for "ours".
      let endLine = totalLines + 1
      const scanLimit = Math.min(totalLines + 1, cursor + MAX_FORWARD_SCAN_LINES)
      search: for (let line = cursor; line <= scanLimit; line++) {
        for (let j = idx + 1; j < blocks.length; j++) {
          if (matchesAt(blocks[j].oursLines, line) || matchesAt(blocks[j].theirsLines, line)) {
            endLine = line
            break search
          }
        }
      }
      consumed = Math.max(0, endLine - cursor)
      oursIncluded = consumed > 0
      theirsIncluded = false
    }

    const oursTouched = auto ? false : oursIncluded !== prevOursIncluded || prevOursTouched
    const theirsTouched = auto ? false : theirsIncluded !== prevTheirsIncluded || prevTheirsTouched

    placements.set(block.blockId, {
      blockId: block.blockId,
      centerStartLine: cursor,
      centerLineCount: consumed,
      oursIncluded,
      theirsIncluded,
      oursTouched,
      theirsTouched,
    })
    cursor += consumed
  }

  return placements
}

/** After the wand: non-conflicting blocks (`ours-only` / `theirs-only`) resolve to their one
 * meaningful side and are marked fully settled (gray, matching `auto_merge_non_conflicting` in
 * git_merge_diff.rs, which only ever picks one side for these). `both-different` conflicts are
 * left fully untouched — the wand never guesses on a real conflict, and leaving both flags
 * untouched (rather than "resolved") is what keeps the "keep both" option available afterwards.
 * A block the user already touched by hand is left as they set it. */
export function placementOverridesAfterAutoMerge(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>
): Map<number, PlacementFlags> {
  const overrides = new Map<number, PlacementFlags>()
  for (const block of blocks) {
    const current = placements.get(block.blockId)
    if (current && (current.oursTouched || current.theirsTouched)) {
      overrides.set(block.blockId, {
        oursIncluded: current.oursIncluded,
        theirsIncluded: current.theirsIncluded,
        oursTouched: current.oursTouched,
        theirsTouched: current.theirsTouched,
      })
      continue
    }
    if (block.kind === 'theirs-only') {
      overrides.set(block.blockId, { oursIncluded: false, theirsIncluded: true, oursTouched: true, theirsTouched: true })
    } else if (block.kind === 'ours-only') {
      overrides.set(block.blockId, { oursIncluded: true, theirsIncluded: false, oursTouched: true, theirsTouched: true })
    } else {
      overrides.set(block.blockId, defaultFlags()) // unchanged/both-same/both-different: leave as default
    }
  }
  return overrides
}

/** Whether a one-sided block is a pure addition, a pure deletion, or a modification, inferred
 * from which side has zero lines at this base range (the side that didn't change mirrors the
 * common ancestor, so a zero count there means the other side purely inserted new content;
 * zero on the changed side itself means it purely deleted content that still exists on the
 * other, unchanged side). */
export type ChangeKind = 'addition' | 'deletion' | 'modification' | 'conflict'

export function changeKindForBlock(block: MergeBlock): ChangeKind {
  if (block.kind === 'both-different') return 'conflict'
  if (block.kind === 'ours-only') {
    if (block.theirsLineCount === 0) return 'addition'
    if (block.oursLineCount === 0) return 'deletion'
    return 'modification'
  }
  if (block.kind === 'theirs-only') {
    if (block.oursLineCount === 0) return 'addition'
    if (block.theirsLineCount === 0) return 'deletion'
    return 'modification'
  }
  return 'modification'
}

export type ColorToken = 'addition' | 'deletion' | 'modification' | 'conflict' | 'resolved'

/** Gray once a side has been explicitly decided (touched) — regardless of whether it ended up
 * included or excluded, since "excluded" is still a decision, not a limbo state. Otherwise:
 * green for a pure addition; gray for a pure deletion (nothing to decide *about* new content
 * here, just whether to keep or drop what's already there — visually identical to "resolved"
 * since there's no real distinction to draw); blue for a one-sided modification (only one side
 * actually changed the value — the other side still mirrors the unchanged ancestor); red for a
 * genuine two-sided conflict (both sides changed the *same* spot to *different* values — the
 * one case that needs the most attention). Side-independent: for addition/deletion only one
 * side ever has content to color in the first place (callers already gate on that side's own
 * line count being > 0), so which literal side is passed in doesn't change the outcome.
 * Exported for mergeDecorations.ts, which derives border/view-zone classes from the same token
 * rather than re-deriving the state→color mapping. */
export function sideColorToken(block: MergeBlock, touched: boolean): ColorToken | undefined {
  if (isAutoMerged(block)) return undefined
  if (touched) return 'resolved'

  const changeKind = changeKindForBlock(block)
  if (changeKind === 'addition') return 'addition'
  if (changeKind === 'deletion') return 'deletion'
  if (changeKind === 'conflict') return 'conflict'
  return 'modification' // one-sided modification only, from here on
}

export function connectorClassForSide(block: MergeBlock, touched: boolean, _side: MergeSide): string | undefined {
  const token = sideColorToken(block, touched)
  return token && `merge-connector-${token}`
}
