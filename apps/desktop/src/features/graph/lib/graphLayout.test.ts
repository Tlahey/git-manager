import { describe, it, expect } from 'vitest'
import { COL_WIDTH } from './graphLayout'

describe('graphLayout — COL_WIDTH', () => {
  it('stays wide enough that a standard avatar never overlaps a neighbouring lane', () => {
    // Standard avatar radius is 16px; a lane center sits COL_WIDTH away, so the avatar edge must
    // clear it. Guards against tightening the spacing to the point avatars swallow adjacent lines.
    const STANDARD_AVATAR_RADIUS = 16
    expect(COL_WIDTH).toBeGreaterThanOrEqual(STANDARD_AVATAR_RADIUS)
  })
})
