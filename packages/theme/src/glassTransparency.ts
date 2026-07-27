// ─── Glass transparency level → material alphas ──────────────────────────────
//
// How see-through a glass theme should be is not knowable from inside the app.
// It depends on the user's wallpaper (a busy photo drowns dark text that a plain
// gradient leaves perfectly readable) and on how much the native material already
// lightens what is behind it. So instead of a fixed set of alphas, the theme
// declares its *range* and the user picks a point on it.
//
// The level is one number (0–100) driving all three surfaces at once, because they
// are not independent: making the chrome see-through while the content stays solid
// reads as a bug, not as a setting.

/** The three surface alphas a glass theme paints with. */
export interface GlassAlphas {
  /** Panels and popovers inside the content region (`--glass-alpha`). */
  panel: number
  /** Nav chrome: rail, tab bar, toolbar, footer (`--glass-chrome-alpha`). */
  chrome: number
  /** The main content region (`--glass-content-alpha`). */
  content: number
}

/** The alphas at level 0 — every surface fully opaque, i.e. glass off. */
const OPAQUE: GlassAlphas = { panel: 1, chrome: 1, content: 1 }

/**
 * The alphas at level 100 — every surface fully transparent, so the window is nothing
 * but the native material and the desktop behind it.
 *
 * The far end is genuinely unusable for reading a diff, and that is intentional: the
 * range covers the whole span so the user can find their own point on it rather than
 * being capped at whatever seemed sensible here. Guessing that cap wrong is exactly
 * what made the setting look broken before.
 */
const CLEAREST: GlassAlphas = { panel: 0, chrome: 0, content: 0 }

/** The level applied when the user has never touched the setting. */
export const DEFAULT_GLASS_TRANSPARENCY = 70

/** Clamps an arbitrary stored value onto the 0–100 scale. */
export function clampGlassTransparency(level: number): number {
  if (!Number.isFinite(level)) return DEFAULT_GLASS_TRANSPARENCY
  return Math.min(100, Math.max(0, Math.round(level)))
}

/**
 * The surface alphas for a transparency level, interpolated between fully opaque
 * (0) and the theme's clearest setting (100).
 *
 * Linear, and now identical across the three surfaces: they all travel the full span
 * together. An earlier version gave each a different range so the content kept more
 * cover than the chrome at the same setting — well-meant, but it meant the top of the
 * slider was not actually transparent, and no amount of dragging got there.
 */
export function glassAlphasForLevel(level: number): GlassAlphas {
  const t = clampGlassTransparency(level) / 100
  const mix = (from: number, to: number) => Number((from + (to - from) * t).toFixed(3))
  return {
    panel: mix(OPAQUE.panel, CLEAREST.panel),
    chrome: mix(OPAQUE.chrome, CLEAREST.chrome),
    content: mix(OPAQUE.content, CLEAREST.content),
  }
}

/**
 * The CSS custom properties to set on the document root for a level, keyed by
 * token name. Applied as inline properties so they win over the theme's own
 * declarations without the theme file needing to know the setting exists.
 */
export function glassTransparencyVars(level: number): Record<string, string> {
  const alphas = glassAlphasForLevel(level)
  return {
    '--glass-alpha': String(alphas.panel),
    '--glass-chrome-alpha': String(alphas.chrome),
    '--glass-content-alpha': String(alphas.content),
  }
}

/** The custom properties this module owns, for clearing them on an opaque theme. */
export const GLASS_TRANSPARENCY_VARS = [
  '--glass-alpha',
  '--glass-chrome-alpha',
  '--glass-content-alpha',
] as const
