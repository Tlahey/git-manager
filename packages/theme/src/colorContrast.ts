// ─── WCAG + APCA color-contrast math ────────────────────────────────────────
//
// Pure helpers used to validate theme accessibility (see themeTokens.ts and the
// themeTokens.test.ts suite).  Everything here is framework-free so it can be
// unit-tested directly and, if wanted, reused at runtime to vet user themes.
//
// Role split: this is the fast, browser-less, design-TOKEN gate — it grades HSL
// triplets straight from themes.css (including a token-level APCA Lc via apcaLc).
// The RENDERED counterpart — axe + apca-check over real pixels, font-size/weight
// aware, /opacity blending included — lives in @git-manager/storybook-a11y. Both
// exist on purpose: this one pinpoints the offending token pair instantly; the
// rendered one catches what only the browser can see.

export interface Rgb {
  r: number // 0-255
  g: number // 0-255
  b: number // 0-255
}

/**
 * Parses a CSS-variable HSL triplet as stored in themes.css, e.g.
 * `"222.2 84% 4.9%"` (hue, saturation%, lightness%).  Returns `null` when the
 * string is not a well-formed triplet.
 */
export function parseHslTriplet(value: string): { h: number; s: number; l: number } | null {
  const m = value
    .trim()
    .match(/^(-?[\d.]+)\s+(-?[\d.]+)%\s+(-?[\d.]+)%$/)
  if (!m) return null
  const h = Number(m[1])
  const s = Number(m[2])
  const l = Number(m[3])
  if (![h, s, l].every(Number.isFinite)) return null
  return { h, s, l }
}

/** Converts an HSL triplet (h in degrees, s/l in percent) to 0-255 RGB. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = ln - c / 2
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

/** WCAG relative luminance of an sRGB color. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * WCAG contrast ratio between two colors, in the range 1 (identical) to 21
 * (pure black on pure white).  Order-independent.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Convenience: contrast ratio between two HSL triplets in themes.css form. */
export function contrastRatioForHslTriplets(fg: string, bg: string): number | null {
  const f = parseHslTriplet(fg)
  const b = parseHslTriplet(bg)
  if (!f || !b) return null
  return contrastRatio(hslToRgb(f.h, f.s, f.l), hslToRgb(b.h, b.s, b.l))
}

// ─── APCA (Advanced Perceptual Contrast Algorithm, WCAG 3 draft) ─────────────
//
// The WCAG 2.x ratio above is a poor predictor of *perceived* readability for many
// pairs — notably mid-blues and dark UI — and can rate a visibly weak pair "AA"
// (e.g. our blue count badge: WCAG 4.85 but only APCA Lc ~39, which Chrome DevTools
// flags). APCA models luminance perceptually and returns a signed "Lc" value in
// roughly -108..106; readable-magnitude thresholds scale with text size/weight
// (see APCA_MIN_* in themeTokens.ts). Constants: APCA-W3 0.1.9, the version
// DevTools reports, so our numbers match what you see there.
const APCA = {
  trc: 2.4,
  Rco: 0.2126729, Gco: 0.7151522, Bco: 0.072175,
  normBG: 0.56, normTXT: 0.57, revTXT: 0.62, revBG: 0.65,
  blkThrs: 0.022, blkClmp: 1.414,
  scale: 1.14, loClip: 0.1, deltaYmin: 0.0005, loOffset: 0.027,
}

/** APCA screen luminance (Y) of an sRGB color. */
function apcaY({ r, g, b }: Rgb): number {
  const lin = (c: number) => (c / 255) ** APCA.trc
  return APCA.Rco * lin(r) + APCA.Gco * lin(g) + APCA.Bco * lin(b)
}

/**
 * APCA lightness contrast (Lc) of `text` over `bg`. Signed: positive for dark text
 * on a light background, negative for light text on a dark background. Callers
 * typically compare `Math.abs(Lc)` against a size-dependent threshold.
 */
export function apcaLc(text: Rgb, bg: Rgb): number {
  let txtY = apcaY(text)
  let bgY = apcaY(bg)
  txtY = txtY > APCA.blkThrs ? txtY : txtY + (APCA.blkThrs - txtY) ** APCA.blkClmp
  bgY = bgY > APCA.blkThrs ? bgY : bgY + (APCA.blkThrs - bgY) ** APCA.blkClmp
  if (Math.abs(bgY - txtY) < APCA.deltaYmin) return 0
  let out: number
  if (bgY > txtY) {
    // normal polarity: dark text on light background
    const sapc = (bgY ** APCA.normBG - txtY ** APCA.normTXT) * APCA.scale
    out = sapc < APCA.loClip ? 0 : sapc - APCA.loOffset
  } else {
    // reverse polarity: light text on dark background
    const sapc = (bgY ** APCA.revBG - txtY ** APCA.revTXT) * APCA.scale
    out = sapc > -APCA.loClip ? 0 : sapc + APCA.loOffset
  }
  return out * 100
}

/** Convenience: absolute APCA Lc between two HSL triplets (text `fg` over `bg`). */
export function apcaLcForHslTriplets(fg: string, bg: string): number | null {
  const f = parseHslTriplet(fg)
  const b = parseHslTriplet(bg)
  if (!f || !b) return null
  return Math.abs(apcaLc(hslToRgb(f.h, f.s, f.l), hslToRgb(b.h, b.s, b.l)))
}
