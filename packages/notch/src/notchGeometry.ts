/**
 * Every number the notch card and its window are laid out from — in one place, computed rather
 * than written down.
 *
 * The card's height used to be a hand-maintained constant (`POPOVER_HEIGHT = 178`) with a comment
 * asking the next person to keep it in sync with the sum of the rows below it. That is exactly the
 * kind of figure that drifts the first time a row's padding changes, and the symptom is silent:
 * the flexible row absorbs the difference and the card just looks slightly wrong. Here the rows
 * are the source of truth, the components render them at these exact heights, and
 * {@link measureCardHeight} adds them up.
 */

import { STATUS_OUTPUT_MAX_LINES, type NotchModel } from './types'

// ── Notch geometry ─────────────────────────────────────────────────────────────────────────────
// The card's top edge sits at the very top of the screen, so on a notched MacBook its first band
// is *behind the camera housing*: anything drawn in the middle of it is physically invisible. The
// band is therefore reserved — no content taller than it, and what content it does hold is pinned
// to the two slivers of real screen either side of the housing.
//
// 32 is `NSScreen.safeAreaInsets.top` as every notched Mac reports it (14"/16" Pro, M-series Air),
// and it degrades correctly on a notchless display — there the band is simply the strip that
// overlaps the menu bar, which is just as unusable for anything you expect to be readable.

/** Height of the reserved band at the top of the card. */
export const NOTCH_BAND_HEIGHT = 32
/** Half the camera housing's width. The card is centred on screen, so the housing is centred on
 *  the card, and this is how far it reaches either side of the card's midpoint. */
export const NOTCH_HOUSING_HALF_WIDTH = 100
/** Breathing room between a band sliver's content and the housing it must not run under. */
export const NOTCH_BAND_GUTTER = 20

/** The card's width. Fixed: a notification is a glance, not a document. */
export const NOTCH_CARD_WIDTH = 440

/**
 * Transparent margin around the visible card, on all four sides, inside the OS window. Needed so
 * the halo glow (a `box-shadow` on the card) has room to bleed outward — a `box-shadow` is clipped
 * at its own window's edge, so a card that filled the entire window couldn't show any glow at all.
 * Sized a little above the halo's widest blur radius (20px at the pulse's peak) so the glow fades
 * out on its own rather than being cut off at the window edge.
 */
export const HALO_MARGIN = 26

/**
 * Every row height the card is built from. The components apply these as explicit `height` styles
 * rather than letting padding decide, which is what makes {@link measureCardHeight} exact instead
 * of approximate.
 */
export const NOTCH_ROW = {
  /** Row 0, reserved for the camera housing. */
  band: NOTCH_BAND_HEIGHT,
  /** Row 1: what happened, and where. */
  header: 48,
  /** Row 2, `event`: avatar + title + subtitle. */
  eventBody: 48,
  /** Row 2, `progress`: title + bar + detail — one line taller than the others. */
  progressBody: 56,
  /** Row 2, `status`: just the outcome line; output lines are added on top. */
  statusBody: 44,
  /** One line of monospace process output. */
  statusOutputLine: 15,
  /** Padding around the output block, when there is one. */
  statusOutputPadding: 12,
  /** Row 3: buttons and badge. */
  actions: 48,
  /** A hairline rule between two rows. */
  rule: 1,
} as const

/**
 * A row's border-box height when it also draws a hairline rule on one of its edges.
 *
 * Tailwind's preflight puts every element in `border-box`, so a `border-b` eats into the height
 * rather than adding to it. A row that wants its full content height *and* a rule has to be one
 * point taller — which is exactly the `rule` entry {@link notchRowHeights} accounts for, so
 * components must size those rows through this helper or the sum stops matching the render.
 */
export function withRule(height: number): number {
  return height + NOTCH_ROW.rule
}

/** Whether the card gets an action row at all — a badge alone is enough to warrant one. */
export function hasActionRow(model: NotchModel): boolean {
  return (model.actions?.length ?? 0) > 0 || model.badge !== undefined
}

/** The height of the `status` kind's output block, `0` when it has no output to show. */
export function statusOutputHeight(lineCount: number): number {
  const shown = Math.min(lineCount, STATUS_OUTPUT_MAX_LINES)
  if (shown <= 0) return 0
  return shown * NOTCH_ROW.statusOutputLine + NOTCH_ROW.statusOutputPadding
}

/**
 * The card's rows, top to bottom, as heights. The single source both the layout and the window
 * sizing read — a new row shows up in the window's height for free.
 */
export function notchRowHeights(model: NotchModel): number[] {
  // Three hairlines: under the band, under the header, above the actions. Each is a `border-*` on
  // the row above it, which `withRule` is what makes an honest point of height rather than a
  // pixel quietly eaten out of a padding-driven row (which is how the shipped card's 178 was one
  // point short of what it actually rendered).
  const rows: number[] = [NOTCH_ROW.band, NOTCH_ROW.rule, NOTCH_ROW.header, NOTCH_ROW.rule]

  if (model.kind === 'event') rows.push(NOTCH_ROW.eventBody)
  else if (model.kind === 'progress') rows.push(NOTCH_ROW.progressBody)
  else {
    rows.push(NOTCH_ROW.statusBody)
    const output = statusOutputHeight(model.outputLines?.length ?? 0)
    if (output > 0) rows.push(output)
  }

  if (hasActionRow(model)) rows.push(NOTCH_ROW.rule, NOTCH_ROW.actions)
  return rows
}

/** How tall the card is for this model, in points. */
export function measureCardHeight(model: NotchModel): number {
  return notchRowHeights(model).reduce((sum, h) => sum + h, 0)
}

/**
 * The widest a band sliver's content may be before it disappears under the camera housing.
 *
 * The card is centred on screen and the housing is centred on the card, so each sliver of usable
 * band is `cardWidth / 2 - housingHalfWidth` wide; the gutter keeps the text from butting right up
 * against the housing's edge.
 */
export function bandSlotMaxWidth(
  cardWidth: number = NOTCH_CARD_WIDTH,
  housingHalfWidth: number = NOTCH_HOUSING_HALF_WIDTH
): number {
  return Math.max(0, cardWidth / 2 - housingHalfWidth - NOTCH_BAND_GUTTER)
}

export interface NotchRect {
  x: number
  y: number
  width: number
  height: number
}

export interface NotchPlacement {
  /** Where the card is *seen*. */
  card: NotchRect
  /** The OS window that contains it — the card inflated by {@link HALO_MARGIN} on every side, so
   *  the halo has somewhere to bleed. */
  window: NotchRect
}

/**
 * Places the card horizontally centred on the display, its top edge at `topY`.
 *
 * The two rects are returned together on purpose: the card's visible position and the window's
 * position differ by exactly one margin, and every past bug in this area came from one call site
 * remembering to subtract it and another forgetting.
 */
export function computeNotchPlacement(input: {
  screenWidth: number
  cardHeight: number
  /** Top of the card in screen points — flush with the top of the display, in practice. */
  topY: number
  cardWidth?: number
}): NotchPlacement {
  const width = input.cardWidth ?? NOTCH_CARD_WIDTH
  const card: NotchRect = {
    x: input.screenWidth / 2 - width / 2,
    y: input.topY,
    width,
    height: input.cardHeight,
  }
  return {
    card,
    window: {
      x: card.x - HALO_MARGIN,
      y: card.y - HALO_MARGIN,
      width: card.width + HALO_MARGIN * 2,
      height: card.height + HALO_MARGIN * 2,
    },
  }
}

/**
 * A display the card can be previewed against.
 *
 * The point resolutions are Apple's default "looks like" scaled sizes. `safeAreaTop` is the figure
 * every notched Mac reports; `housingWidth` is the app's own working value rather than a per-model
 * measurement — see the `get_notch_metrics` follow-up for reading `NSScreen.auxiliaryTopLeftArea`
 * and calibrating both. `menuBarHeight` is the harness's approximation for drawing a convincing
 * menu bar and is not load-bearing for the app.
 */
export interface NotchDevicePreset {
  id: string
  label: string
  width: number
  height: number
  /** `0` on a display with no camera housing. */
  safeAreaTop: number
  /** `0` on a display with no camera housing. */
  housingWidth: number
  menuBarHeight: number
}

export const NOTCH_DEVICE_PRESETS: NotchDevicePreset[] = [
  {
    id: 'mbp-14',
    label: 'MacBook Pro 14″',
    width: 1512,
    height: 982,
    safeAreaTop: NOTCH_BAND_HEIGHT,
    housingWidth: NOTCH_HOUSING_HALF_WIDTH * 2,
    menuBarHeight: 37,
  },
  {
    id: 'mbp-16',
    label: 'MacBook Pro 16″',
    width: 1728,
    height: 1117,
    safeAreaTop: NOTCH_BAND_HEIGHT,
    housingWidth: NOTCH_HOUSING_HALF_WIDTH * 2,
    menuBarHeight: 37,
  },
  {
    id: 'mba-13',
    label: 'MacBook Air 13″',
    width: 1470,
    height: 956,
    safeAreaTop: NOTCH_BAND_HEIGHT,
    housingWidth: NOTCH_HOUSING_HALF_WIDTH * 2,
    menuBarHeight: 37,
  },
  {
    // The degradation case, and the one worth looking at: with no housing the reserved band is
    // just the strip that overlaps a shorter menu bar, and the card must still read correctly.
    id: 'external',
    label: 'External display (no notch)',
    width: 1440,
    height: 900,
    safeAreaTop: 0,
    housingWidth: 0,
    menuBarHeight: 24,
  },
]

export function getDevicePreset(id: string): NotchDevicePreset | undefined {
  return NOTCH_DEVICE_PRESETS.find((p) => p.id === id)
}
