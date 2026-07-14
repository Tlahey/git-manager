import { describe, expect, it } from 'vitest'
import type { MergeBlock } from '../types'
import {
  computeInitialCenterText,
  computeInitialPlacements,
  updatePlacementAfterToggle,
} from '../mergeBlockLayout'
import { buildCenterTextFromPlacements } from './centerText'

const blocks: MergeBlock[] = [
  {
    blockId: 1,
    kind: 'unchanged',
    oursStartLine: 1,
    oursLineCount: 1,
    theirsStartLine: 1,
    theirsLineCount: 1,
    oursLines: ['header'],
    theirsLines: ['header'],
  },
  {
    blockId: 2,
    kind: 'both-different',
    oursStartLine: 2,
    oursLineCount: 1,
    theirsStartLine: 2,
    theirsLineCount: 1,
    oursLines: ['ours conflict'],
    theirsLines: ['theirs conflict'],
  },
]

describe('buildCenterTextFromPlacements', () => {
  it('matches computeInitialCenterText for the initial placements', () => {
    const placements = computeInitialPlacements(blocks)
    expect(buildCenterTextFromPlacements(blocks, placements)).toBe(computeInitialCenterText(blocks))
  })

  it('reflects per-block include flags — accepting theirs on the conflict keeps both sides', () => {
    let placements = computeInitialPlacements(blocks)
    placements = updatePlacementAfterToggle(placements, blocks, blocks[1], 'theirs', true)
    expect(buildCenterTextFromPlacements(blocks, placements)).toBe(
      'header\nours conflict\ntheirs conflict'
    )
  })

  it('falls back to a block’s base lines when it has no placement', () => {
    const withBase: MergeBlock[] = [{ ...blocks[1], baseLines: ['base line'] }]
    expect(buildCenterTextFromPlacements(withBase, new Map())).toBe('base line')
  })

  it('treats a missing placement with no baseLines as empty', () => {
    expect(buildCenterTextFromPlacements([blocks[1]], new Map())).toBe('')
  })
})
