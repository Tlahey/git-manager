import { describe, it, expect } from 'vitest'
import { BISECT_ROW_STYLES } from './bisectRow.config'
import type { BisectRowStatus } from './bisectStatus'

const ALL_STATUSES: BisectRowStatus[] = ['firstBad', 'current', 'bad', 'good', 'skip']

describe('BISECT_ROW_STYLES', () => {
  it('covers every bisect status, with all three fields filled', () => {
    for (const status of ALL_STATUSES) {
      const style = BISECT_ROW_STYLES[status]
      expect(style, `missing entry for "${status}"`).toBeDefined()
      expect(style.stripe).toBeTruthy()
      expect(style.rowBg).toBeTruthy()
      expect(style.labelKey).toBeTruthy()
    }
    expect(Object.keys(BISECT_ROW_STYLES).sort()).toEqual([...ALL_STATUSES].sort())
  })

  it('points every status at its own bisect.status.* i18n key', () => {
    for (const status of ALL_STATUSES) {
      expect(BISECT_ROW_STYLES[status].labelKey).toBe(`bisect.status.${status}`)
    }
  })

  it('gives each status a distinct stripe so two markers are never confusable', () => {
    const stripes = ALL_STATUSES.map((s) => BISECT_ROW_STYLES[s].stripe)
    expect(new Set(stripes).size).toBe(stripes.length)
  })

  it('tints the two commits that end a bisect more strongly than a merely marked one', () => {
    // firstBad/current are the rows the user is being pointed at; bad/good/skip are history.
    expect(BISECT_ROW_STYLES.firstBad.rowBg).toContain('/15')
    expect(BISECT_ROW_STYLES.current.rowBg).toContain('/15')
    expect(BISECT_ROW_STYLES.bad.rowBg).toContain('/10')
    expect(BISECT_ROW_STYLES.good.rowBg).toContain('/10')
    expect(BISECT_ROW_STYLES.skip.rowBg).toContain('/10')
  })
})
