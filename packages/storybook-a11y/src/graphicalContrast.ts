import { contrastRatio } from '@git-manager/theme'
import type { ViolationNodeRecord } from './apca-report-types'

// ─── Non-text (graphical) contrast gate — WCAG 2.x SC 1.4.11 ─────────────────
//
// axe's automated rules + APCA Bronze grade the contrast of *text* only. State that
// a control conveys through a small GRAPHIC — a checkbox's tick, a switch's thumb, a
// radio's dot — is invisible to them twice over: it's non-text, and it's usually
// aria-hidden (decorative). That's exactly how a black tick on a light-violet fill
// (Twilight) or a near-black thumb on a dark track (dark themes) slipped past a fully
// green a11y run. WCAG 1.4.11 requires ≥ 3:1 between such a graphic and its adjacent
// background, and nothing here was checking it.
//
// This is that check, and it's OPT-IN so it can't false-positive on unrelated markup:
//   · the background element carries  data-contrast-ground
//   · each graphic sitting on it carries data-contrast-mark="<label>"
// Both live under the same parent (the control wrapper). For every VISIBLE mark we
// compute its rendered colour (its own background, or its text/`currentColor` for a
// glyph), blend any alpha over the ground, and assert ≥ 3:1 against the ground's
// effective background. Runs per theme × surface inside runA11yMatrix, so a regression
// on ANY theme fails the build — the automated equivalent of eyeballing every toggle.

/** WCAG 1.4.11 minimum contrast for non-text UI components / graphics. */
export const MIN_GRAPHICAL_RATIO = 3

interface Rgb {
  r: number
  g: number
  b: number
}
interface Rgba extends Rgb {
  a: number
}

/** Parses a computed `rgb()/rgba()` colour (incl. the `rgb(r g b / a)` form). */
export function parseCssColor(input: string): Rgba | null {
  if (!input) return null
  if (input === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  const nums = input.replace(/,/g, ' ').match(/[\d.]+/g)
  if (!nums || nums.length < 3) return null
  const [r, g, b] = nums.map(Number)
  const a = nums.length >= 4 ? Number(nums[3]) : 1
  if (![r, g, b, a].every(Number.isFinite)) return null
  return { r, g, b, a }
}

/** Composites a (possibly translucent) colour over an opaque backing. */
function blend(fg: Rgba, bg: Rgb): Rgb {
  const a = fg.a
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  }
}

/**
 * The effective (opaque) background painted behind `el`: walks up the ancestor chain
 * stacking translucent layers until an opaque one is found, then composites them.
 * Falls back to white if nothing opaque is reached.
 */
export function effectiveBackground(el: Element): Rgb {
  const layers: Rgba[] = []
  let node: Element | null = el
  while (node) {
    const c = parseCssColor(getComputedStyle(node).backgroundColor)
    if (c && c.a > 0) {
      layers.push(c)
      if (c.a >= 0.999) break
    }
    node = node.parentElement
  }
  let base: Rgb = { r: 255, g: 255, b: 255 }
  for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base)
  return base
}

/** The rendered colour of a mark: its own fill, else its text/`currentColor`. */
function markColor(el: Element, ground: Rgb): Rgb | null {
  const style = getComputedStyle(el)
  const bg = parseCssColor(style.backgroundColor)
  if (bg && bg.a > 0) return blend(bg, ground)
  // Glyphs (e.g. an <svg> tick with stroke="currentColor") carry no background — grade
  // their `color`, which is what actually paints on screen.
  const fg = parseCssColor(style.color)
  if (fg && fg.a > 0) return blend(fg, ground)
  return null
}

/** True only if `el` and every ancestor are displayed and effectively opaque. */
function isRenderedOpaque(el: Element): boolean {
  let node: Element | null = el
  let opacity = 1
  while (node) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    opacity *= Number(style.opacity || '1')
    node = node.parentElement
  }
  return opacity >= 0.99
}

/**
 * Scans `container` for opted-in control graphics and returns a violation record for
 * every VISIBLE mark whose contrast against its ground is below `minRatio`. Shaped as
 * `ViolationNodeRecord` so it flows through the same report + assertion as axe results.
 */
export function checkGraphicalContrast(
  container: Element,
  minRatio: number = MIN_GRAPHICAL_RATIO,
): ViolationNodeRecord[] {
  const records: ViolationNodeRecord[] = []
  for (const mark of container.querySelectorAll('[data-contrast-mark]')) {
    if (!isRenderedOpaque(mark)) continue
    const ground = mark.parentElement?.querySelector(':scope > [data-contrast-ground]')
    if (!ground) continue
    const groundRgb = effectiveBackground(ground)
    const figRgb = markColor(mark, groundRgb)
    if (!figRgb) continue
    const ratio = contrastRatio(figRgb, groundRgb)
    if (ratio >= minRatio) continue
    const label = mark.getAttribute('data-contrast-mark') || 'mark'
    const rgb = (c: Rgb) => `rgb(${[c.r, c.g, c.b].map((n) => Math.round(n)).join(' ')})`
    records.push({
      rule: 'graphical-contrast',
      target: `[data-contrast-mark="${label}"]`,
      html: mark.outerHTML.replace(/\s+/g, ' ').trim().slice(0, 300),
      message: `non-text contrast ${ratio.toFixed(2)}:1 is below the ${minRatio}:1 minimum (WCAG 1.4.11) for "${label}"`,
      data: { ratio: Number(ratio.toFixed(2)), fg: rgb(figRgb), bg: rgb(groundRgb) },
    })
  }
  return records
}
