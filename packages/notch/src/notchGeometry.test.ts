import { describe, it, expect } from 'vitest'
import {
  bandSlotMaxWidth,
  computeNotchPlacement,
  getDevicePreset,
  hasActionRow,
  HALO_MARGIN,
  measureCardHeight,
  NOTCH_CARD_WIDTH,
  NOTCH_DEVICE_PRESETS,
  NOTCH_REWARD_MEDAL_SIZE,
  NOTCH_ROW,
  NOTCH_ROW_PADDING_X,
  notchRowHeights,
  rewardConfettiOrigin,
  statusOutputHeight,
  withRule,
} from './notchGeometry'
import type {
  NotchEventModel,
  NotchProgressModel,
  NotchRewardModel,
  NotchStatusModel,
} from './types'

const event: NotchEventModel = {
  kind: 'event',
  id: 'e1',
  tone: 'info',
  eyebrow: 'NEW PR',
  title: 'feat: add the thing',
  actions: [{ id: 'open', label: 'Open' }],
}

const progress: NotchProgressModel = {
  kind: 'progress',
  id: 'p1',
  tone: 'running',
  eyebrow: 'SCANNING',
  title: 'Searching commits',
  ratio: 0.25,
}

const status: NotchStatusModel = {
  kind: 'status',
  id: 's1',
  tone: 'error',
  eyebrow: 'PRE-COMMIT',
  title: 'lint-staged failed',
}

const reward: NotchRewardModel = {
  kind: 'reward',
  id: 'r1',
  tone: 'highlight',
  eyebrow: 'ACHIEVEMENT UNLOCKED',
  title: 'Merge Master',
  tier: 'gold',
  badge: '+100 XP',
}

/** band + rule + header + rule + body + rule + actions — the full event card. */
const FULL_EVENT_CARD_HEIGHT = 179

describe('measureCardHeight', () => {
  it('matches the PR popover the card replaced, to the point', () => {
    // The event card with a header, a body and an action row is exactly what the GitHub PR
    // notification renders. Its hand-maintained constant was 178, one point short of what it
    // actually drew: it counted two of the three hairlines. If this ever changes, the window is
    // resized with it — which is the whole point of computing it instead of writing it down.
    expect(measureCardHeight(event)).toBe(FULL_EVENT_CARD_HEIGHT)
  })

  it('drops the action row (and its rule) when there is nothing to put in it', () => {
    const { actions: _actions, ...bare } = event
    expect(measureCardHeight(bare as NotchEventModel)).toBe(
      FULL_EVENT_CARD_HEIGHT - NOTCH_ROW.actions - NOTCH_ROW.rule
    )
  })

  it('keeps the action row for a badge with no buttons', () => {
    const badgeOnly: NotchEventModel = { ...event, actions: [], badge: '#231' }
    expect(hasActionRow(badgeOnly)).toBe(true)
    expect(measureCardHeight(badgeOnly)).toBe(FULL_EVENT_CARD_HEIGHT)
  })

  it('gives the progress body its extra line for the bar', () => {
    expect(measureCardHeight(progress)).toBe(
      NOTCH_ROW.band + NOTCH_ROW.rule + NOTCH_ROW.header + NOTCH_ROW.rule + NOTCH_ROW.progressBody
    )
  })

  it('gives the reward body its third line', () => {
    // Medal, achievement, what earned it, what it grants — one line more than any other body, which
    // is why it has a row height of its own instead of borrowing the event's.
    expect(measureCardHeight(reward)).toBe(
      NOTCH_ROW.band +
        NOTCH_ROW.rule +
        NOTCH_ROW.header +
        NOTCH_ROW.rule +
        NOTCH_ROW.rewardBody +
        NOTCH_ROW.rule +
        NOTCH_ROW.actions
    )
  })

  it('grows a status card by the output block it actually shows', () => {
    const bare = measureCardHeight(status)
    const withOutput = measureCardHeight({ ...status, outputLines: ['a', 'b'] })
    expect(withOutput - bare).toBe(2 * NOTCH_ROW.statusOutputLine + NOTCH_ROW.statusOutputPadding)
  })

  it('stops growing past the lines the card is willing to render', () => {
    const three = measureCardHeight({ ...status, outputLines: ['a', 'b', 'c'] })
    const twenty = measureCardHeight({ ...status, outputLines: Array(20).fill('x') })
    expect(twenty).toBe(three)
  })
})

describe('notchRowHeights', () => {
  it('always opens with the reserved band and a rule under it', () => {
    expect(notchRowHeights(progress).slice(0, 2)).toEqual([NOTCH_ROW.band, NOTCH_ROW.rule])
  })

  it('counts a hairline under the header too', () => {
    expect(notchRowHeights(progress).slice(2, 4)).toEqual([NOTCH_ROW.header, NOTCH_ROW.rule])
  })

  it('sums to the measured height', () => {
    for (const model of [event, progress, reward, { ...status, outputLines: ['x'] }]) {
      const sum = notchRowHeights(model).reduce((a, b) => a + b, 0)
      expect(sum).toBe(measureCardHeight(model))
    }
  })

  it('takes the real per-machine band height when given one, instead of the default guess', () => {
    // `get_notch_metrics` reads this off `NSScreen.safeAreaInsets.top` for the actual machine.
    expect(notchRowHeights(progress, 38).slice(0, 1)).toEqual([38])
    expect(measureCardHeight(progress, 38)).toBe(
      measureCardHeight(progress) + (38 - NOTCH_ROW.band)
    )
  })

  it('falls back to NOTCH_BAND_HEIGHT when no override is given', () => {
    expect(notchRowHeights(progress)[0]).toBe(NOTCH_ROW.band)
  })
})

describe('rewardConfettiOrigin', () => {
  it('starts the burst at the centre of the medal', () => {
    expect(rewardConfettiOrigin()).toEqual({
      x: NOTCH_ROW_PADDING_X + NOTCH_REWARD_MEDAL_SIZE / 2,
      y: withRule(NOTCH_ROW.band) + withRule(NOTCH_ROW.header) + NOTCH_ROW.rewardBody / 2,
    })
  })

  it('moves down with a taller safe area, since the medal really is lower on that machine', () => {
    // Derived rather than tuned by eye — a row height changing above the medal takes the burst with
    // it, instead of leaving paper coming out of the card's edge.
    const taller = rewardConfettiOrigin(38)
    expect(taller.y - rewardConfettiOrigin().y).toBe(38 - NOTCH_ROW.band)
    expect(taller.x).toBe(rewardConfettiOrigin().x)
  })

  it('lands inside the card it is thrown in', () => {
    const origin = rewardConfettiOrigin()
    expect(origin.x).toBeGreaterThan(0)
    expect(origin.x).toBeLessThan(NOTCH_CARD_WIDTH)
    // Below the reserved band, or the burst would come out from behind the camera housing.
    expect(origin.y).toBeGreaterThan(NOTCH_ROW.band)
    expect(origin.y).toBeLessThan(measureCardHeight(reward))
  })
})

describe('withRule', () => {
  it('adds the hairline back on top of a border-box row', () => {
    // Tailwind's preflight makes every element border-box, so a `border-b` is taken *out* of the
    // height. A row sized without this helper renders one point shorter than the sum says.
    expect(withRule(NOTCH_ROW.band)).toBe(NOTCH_ROW.band + NOTCH_ROW.rule)
  })
})

describe('statusOutputHeight', () => {
  it('is zero when there is no output, rather than a bare padding block', () => {
    expect(statusOutputHeight(0)).toBe(0)
    expect(statusOutputHeight(-1)).toBe(0)
  })
})

describe('bandSlotMaxWidth', () => {
  it('leaves the 100pt slivers the PR popover used', () => {
    expect(bandSlotMaxWidth()).toBe(100)
  })

  it('never goes negative on a card narrower than the housing', () => {
    expect(bandSlotMaxWidth(120)).toBe(0)
  })

  it('gives the whole half-card to the slivers on a display with no housing', () => {
    expect(bandSlotMaxWidth(NOTCH_CARD_WIDTH, 0)).toBe(NOTCH_CARD_WIDTH / 2 - 20)
  })
})

describe('computeNotchPlacement', () => {
  it('centres the card on the display at the requested top edge', () => {
    const { card } = computeNotchPlacement({ screenWidth: 1512, cardHeight: 178, topY: 0 })
    expect(card).toEqual({
      x: (1512 - NOTCH_CARD_WIDTH) / 2,
      y: 0,
      width: NOTCH_CARD_WIDTH,
      height: 178,
    })
  })

  it('inflates the window by exactly one halo margin on every side', () => {
    const { card, window } = computeNotchPlacement({
      screenWidth: 1512,
      cardHeight: 178,
      topY: -1,
    })
    expect(window.x).toBe(card.x - HALO_MARGIN)
    expect(window.y).toBe(card.y - HALO_MARGIN)
    expect(window.width).toBe(card.width + HALO_MARGIN * 2)
    expect(window.height).toBe(card.height + HALO_MARGIN * 2)
  })

  it('honours a custom card width', () => {
    const { card } = computeNotchPlacement({
      screenWidth: 1000,
      cardHeight: 100,
      topY: 0,
      cardWidth: 300,
    })
    expect(card.x).toBe(350)
    expect(card.width).toBe(300)
  })
})

describe('NOTCH_DEVICE_PRESETS', () => {
  it('includes a notchless display, so the degradation case is always visible', () => {
    const external = getDevicePreset('external')
    expect(external?.safeAreaTop).toBe(0)
    expect(external?.housingWidth).toBe(0)
  })

  it('gives every notched preset the reported 32pt safe-area inset', () => {
    for (const preset of NOTCH_DEVICE_PRESETS.filter((p) => p.housingWidth > 0)) {
      expect(preset.safeAreaTop).toBe(NOTCH_ROW.band)
    }
  })

  it('has unique ids', () => {
    const ids = NOTCH_DEVICE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns undefined for an unknown id rather than a default nobody asked for', () => {
    expect(getDevicePreset('nope')).toBeUndefined()
  })
})
