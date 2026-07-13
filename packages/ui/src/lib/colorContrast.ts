// ─── WCAG color-contrast math ───────────────────────────────────────────────
//
// Pure helpers used to validate theme accessibility (see themeTokens.ts and the
// themeAccessibility.test.ts suite).  Everything here is framework-free so it can
// be unit-tested directly and, if wanted, reused at runtime to vet user themes.

export interface Rgb {
  r: number // 0-255
  g: number // 0-255
  b: number // 0-255
}

/**
 * Parses a CSS-variable HSL triplet as stored in globals.css, e.g.
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

/** Convenience: contrast ratio between two HSL triplets in globals.css form. */
export function contrastRatioForHslTriplets(fg: string, bg: string): number | null {
  const f = parseHslTriplet(fg)
  const b = parseHslTriplet(bg)
  if (!f || !b) return null
  return contrastRatio(hslToRgb(f.h, f.s, f.l), hslToRgb(b.h, b.s, b.l))
}
