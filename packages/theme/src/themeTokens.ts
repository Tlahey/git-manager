// ─── Theme token model & accessibility contract ─────────────────────────────
//
// The app's themes are semantic-token sets (shadcn style) declared in
// themes.css as `html[data-theme="<id>"] { --token: <hsl triplet>; ... }`.
// This module parses those blocks and encodes two invariants the test suite
// (themeTokens.test.ts) enforces across every theme:
//
//   1. Structural consistency — every theme defines the exact same token keys,
//      so a token added to one theme can't be silently forgotten in the others.
//   2. Accessibility — each foreground/surface token PAIR meets a WCAG contrast
//      threshold, so no theme ends up with e.g. white text on a yellow accent.
//
// Because Tailwind only ever pairs `<name>` with `<name>-foreground`
// (see packages/config/tailwind.js), validating this fixed set of pairs covers
// every text-on-surface combination the UI can actually produce — provided the
// UI sticks to tokens instead of hard-coded colors.

import { apcaLcForHslTriplets, contrastRatioForHslTriplets, parseHslTriplet } from './colorContrast'

/** The canonical token set every theme must define (order-independent). */
export const THEME_TOKEN_KEYS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--success',
  '--success-foreground',
  '--border',
  '--input',
  '--ring',
  '--radius',
  // Chrome-only surface (sidebar rail + tab bar), kept independent from --card so a
  // theme can give persistent nav chrome a different tone than in-content panels
  // (diff views, KPI cards, dialogs, ...) which stay on --card/--background.
  '--sidebar-background',
  '--sidebar-foreground',
  '--sidebar-border',
  '--sidebar-muted-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
] as const

// WCAG 2.1 thresholds.
export const AA_NORMAL_TEXT = 4.5 // body text
export const AA_LARGE_TEXT = 3.0 // large/bold text and UI components

/**
 * The text-on-surface pairs whose contrast is graded, with the threshold that
 * applies to each.  `muted-foreground` is intentionally low-contrast (hints,
 * timestamps) so it's held to the large-text/UI bar rather than body text.
 */
export interface TokenContrastPair {
  label: string
  fg: string
  bg: string
  minRatio: number
}

/** A graded pair whose tokens are canonical semantic tokens (compile-time guard). */
export interface ContrastPair extends TokenContrastPair {
  fg: (typeof THEME_TOKEN_KEYS)[number]
  bg: (typeof THEME_TOKEN_KEYS)[number]
}

export const CONTRAST_PAIRS: ContrastPair[] = [
  { label: 'foreground/background', fg: '--foreground', bg: '--background', minRatio: AA_NORMAL_TEXT },
  { label: 'card', fg: '--card-foreground', bg: '--card', minRatio: AA_NORMAL_TEXT },
  { label: 'popover', fg: '--popover-foreground', bg: '--popover', minRatio: AA_NORMAL_TEXT },
  { label: 'primary', fg: '--primary-foreground', bg: '--primary', minRatio: AA_NORMAL_TEXT },
  { label: 'secondary', fg: '--secondary-foreground', bg: '--secondary', minRatio: AA_NORMAL_TEXT },
  { label: 'accent', fg: '--accent-foreground', bg: '--accent', minRatio: AA_NORMAL_TEXT },
  { label: 'destructive', fg: '--destructive-foreground', bg: '--destructive', minRatio: AA_NORMAL_TEXT },
  { label: 'success', fg: '--success-foreground', bg: '--success', minRatio: AA_NORMAL_TEXT },
  { label: 'muted-foreground', fg: '--muted-foreground', bg: '--muted', minRatio: AA_LARGE_TEXT },
  // muted-foreground is also commonly rendered directly on the base background.
  { label: 'muted-foreground/background', fg: '--muted-foreground', bg: '--background', minRatio: AA_LARGE_TEXT },
  { label: 'sidebar', fg: '--sidebar-foreground', bg: '--sidebar-background', minRatio: AA_NORMAL_TEXT },
  { label: 'sidebar-accent', fg: '--sidebar-accent-foreground', bg: '--sidebar-accent', minRatio: AA_NORMAL_TEXT },
]

// ─── Tier 3: component tokens (per-component override surface) ────────────────
//
// Component tokens (`--button-bg`, …) default to a semantic token but can be
// re-pointed on a single theme when that theme needs a *component-specific*
// correction — e.g. "on this theme the default button must not use the raw
// --primary, it needs a darker fill so its label stays AA-readable". Defaults
// live once in themes.css `:root`; a theme overrides one by redeclaring it inside
// its own `html[data-theme]` block (parseThemeTokens captures it like any token).
//
// This TS map is the source of truth for the defaults (the CSS `:root` block must
// mirror it — themeTokens.test.ts guards the drift), so the grader can evaluate a
// component pair for a theme that doesn't override it: the default `var(--primary)`
// resolves against that theme's own --primary.
export const COMPONENT_TOKEN_DEFAULTS: Record<string, string> = {
  '--button-bg': 'var(--primary)',
  '--button-foreground': 'var(--primary-foreground)',
  '--button-secondary-bg': 'var(--secondary)',
  '--button-secondary-foreground': 'var(--secondary-foreground)',
  '--button-destructive-bg': 'var(--destructive)',
  '--button-destructive-foreground': 'var(--destructive-foreground)',
  '--button-success-bg': 'var(--success)',
  '--button-success-foreground': 'var(--success-foreground)',
  '--badge-bg': 'var(--primary)',
  '--badge-foreground': 'var(--primary-foreground)',
  // The secondary/destructive Badge variants ride their own component tokens
  // (instead of raw --secondary/--destructive) so a theme can fix the *chip*
  // without moving the semantic color, which is also a surface (--secondary) or a
  // raw icon color (--destructive in toast.tsx).
  '--badge-secondary-bg': 'var(--secondary)',
  '--badge-secondary-foreground': 'var(--secondary-foreground)',
  '--badge-destructive-bg': 'var(--destructive)',
  '--badge-destructive-foreground': 'var(--destructive-foreground)',
  // Soft "tone" chips (Tag + Badge success/warning/danger/info): a translucent
  // /15 tint of the tone color with the *text* in these tokens. Because the text
  // sits on a near-surface background, its readable shade depends on whether the
  // surface is light or dark — so a light-content theme (Twilight) re-points these
  // darker, and .chrome-surface re-points them lighter for the dark nav. Defaults
  // reproduce the previous hard-coded shades so un-migrated themes are unchanged.
  // Not in COMPONENT_CONTRAST_PAIRS: the real bg is a tint-over-surface the token
  // grader can't model, so the axe story matrix owns their contrast instead.
  '--tone-success-foreground': 'var(--success)',
  '--tone-warning-foreground': '32 95% 44%',
  '--tone-danger-foreground': 'var(--destructive)',
  '--tone-info-foreground': '221 83% 53%',
  // The link button / inline links (text-primary was too light as *text* on light
  // content). Defaults to --primary; a light-content theme darkens it.
  '--link': 'var(--primary)',
}

/**
 * The graded component pairs — one per filled component surface. Only variants
 * with a solid fill get a pair (outline/ghost/link inherit --foreground over the
 * page background and are covered by the semantic foreground/background pair).
 * Held to normal-text AA: button labels are 14px, below the large-text bar.
 */
export const COMPONENT_CONTRAST_PAIRS: TokenContrastPair[] = [
  { label: 'button', fg: '--button-foreground', bg: '--button-bg', minRatio: AA_NORMAL_TEXT },
  { label: 'button-secondary', fg: '--button-secondary-foreground', bg: '--button-secondary-bg', minRatio: AA_NORMAL_TEXT },
  { label: 'button-destructive', fg: '--button-destructive-foreground', bg: '--button-destructive-bg', minRatio: AA_NORMAL_TEXT },
  { label: 'button-success', fg: '--button-success-foreground', bg: '--button-success-bg', minRatio: AA_NORMAL_TEXT },
  { label: 'badge', fg: '--badge-foreground', bg: '--badge-bg', minRatio: AA_NORMAL_TEXT },
  { label: 'badge-secondary', fg: '--badge-secondary-foreground', bg: '--badge-secondary-bg', minRatio: AA_NORMAL_TEXT },
  { label: 'badge-destructive', fg: '--badge-destructive-foreground', bg: '--badge-destructive-bg', minRatio: AA_NORMAL_TEXT },
]

// ─── Non-text (graphical) contrast — WCAG 1.4.11 ─────────────────────────────
//
// The pairs above grade *text on a fill*. They do NOT catch a solid graphical
// element whose FILL is too close to the surface behind it — e.g. a count badge
// (NumberBadge) or a status pill that "doesn't pop" off the page. axe's
// color-contrast rule only ever evaluates text, so this class of issue is
// invisible to the story matrix; it's graded here instead. The threshold is the
// 3:1 WCAG 1.4.11 bar for meaningful UI components, applied to the fill vs each
// surface the chip can sit on (worst case wins). `fg` here is the *fill* token.
export const GRAPHICAL_CONTRAST_PAIRS: TokenContrastPair[] = [
  { label: 'badge-fill/background', fg: '--badge-bg', bg: '--background', minRatio: AA_LARGE_TEXT },
  { label: 'badge-fill/card', fg: '--badge-bg', bg: '--card', minRatio: AA_LARGE_TEXT },
  // The destructive badge fill is a status chip too — it must pop off the page,
  // not just carry readable text. (The secondary badge is deliberately NOT graded
  // here: it is a *subtle* chip that rides the secondary surface by design.)
  { label: 'badge-destructive-fill/background', fg: '--badge-destructive-bg', bg: '--background', minRatio: AA_LARGE_TEXT },
  { label: 'badge-destructive-fill/card', fg: '--badge-destructive-bg', bg: '--card', minRatio: AA_LARGE_TEXT },
]

// ─── APCA (WCAG 3 draft) readable-contrast thresholds ────────────────────────
//
// APCA reports a signed "Lc"; readability is judged on |Lc| against a bar that
// rises as text gets smaller/thinner. These are the APCA "bronze" guidance points
// we hold tokens to. Text pairs use the UI-label bar; the badge count is small +
// bold, but we hold it (and every component label) to the same UI bar so a pair
// WCAG 2.x rates "AA" but APCA rates unreadable (the blue badge: WCAG 4.85 / Lc 39)
// is caught.
export const APCA_MIN_BODY_TEXT = 75 // small body/columns of text
export const APCA_MIN_UI_TEXT = 60 // component labels (buttons, badges, tags)

export interface ApcaResult {
  label: string
  lc: number | null // null when a token is missing/unparseable
  minLc: number
  passes: boolean
}

/** Grades one text pair with APCA (|Lc| ≥ minLc), chasing var() on both sides. */
function gradeApca(tokens: ThemeTokens, pair: TokenContrastPair, minLc: number): ApcaResult {
  const fgRaw = tokens.get(pair.fg)
  const bgRaw = tokens.get(pair.bg)
  const fg = fgRaw !== undefined ? resolveTokenValue(tokens, fgRaw) : undefined
  const bg = bgRaw !== undefined ? resolveTokenValue(tokens, bgRaw) : undefined
  const lc = fg && bg ? apcaLcForHslTriplets(fg, bg) : null
  return { label: pair.label, lc, minLc, passes: lc !== null && lc >= minLc }
}

/**
 * Grades every component-label pair (button/badge text) with APCA at the UI-text
 * bar — the perceptual counterpart to evaluateComponentContrast, catching pairs
 * that clear WCAG 2.x but read poorly (mid-blue fills, dark-mode text).
 */
export function evaluateApcaComponentContrast(themeTokens: ThemeTokens): ApcaResult[] {
  const merged = componentTokensForTheme(themeTokens)
  return COMPONENT_CONTRAST_PAIRS.map((pair) => gradeApca(merged, pair, APCA_MIN_UI_TEXT))
}

export type ThemeTokens = Map<string, string>

/**
 * Parses themes.css into a map of `themeId -> (token -> raw value)`.
 *
 * Handles selector lists like `:root, html[data-theme="dark"] { ... }` by
 * attributing the block to every `data-theme` id it names.  Blocks that carry
 * no `data-theme` id (pure `:root`, animation-only rules, `.avatar-frame-*`,
 * theme-scoped overrides such as `html[data-theme="platinum"] .border`) are
 * skipped — only top-level theme token declarations are collected.
 */
export function parseThemeTokens(css: string): Map<string, ThemeTokens> {
  const themes = new Map<string, ThemeTokens>()
  // Strip CSS comments first: prose like "re-pointed off --primary: ..." otherwise
  // gets mis-read as a `--primary: <garbage>;` declaration by the token regex below.
  css = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // Match "<selectors> { <body without nested braces> }".
  const blockRe = /([^{}]+)\{([^{}]*)\}/g
  let block: RegExpExecArray | null
  while ((block = blockRe.exec(css)) !== null) {
    const selector = block[1]
    const body = block[2]
    // Only blocks that target a theme root: the data-theme selector must not be
    // followed by a descendant/combinator (space, ., >, etc.) before the brace.
    const ids = [...selector.matchAll(/html\[data-theme="([a-z0-9-]+)"\]\s*(?=,|\{|$)/g)].map(
      (m) => m[1],
    )
    if (ids.length === 0) continue

    const tokens: ThemeTokens = new Map()
    // Token names include digits (palette ramps like --brand-500, --neutral-100).
    for (const decl of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      tokens.set(decl[1], decl[2].trim())
    }
    for (const id of ids) {
      const existing = themes.get(id)
      if (existing) for (const [k, v] of tokens) existing.set(k, v)
      else themes.set(id, new Map(tokens))
    }
  }
  return themes
}

// ─── var() indirection (palette → semantic → component tiers) ────────────────
//
// A theme block may declare raw palette primitives (e.g. `--brand-500: 258 90% 68%`)
// and have its semantic tokens reference them (`--primary: var(--brand-500)`), so
// the token system is layered instead of every value being a literal triplet. The
// parser keeps all declarations in one map, so resolution just chases the var()
// chain within that same map.

/**
 * Resolves a token value, chasing `var(--x)` / `var(--x, fallback)` references
 * through `all` (the theme's full token map, palette entries included). Returns
 * the first non-var literal reached; leaves a dangling reference as-is so the HSL
 * check still flags it. Guards against reference cycles.
 */
export function resolveTokenValue(
  all: ThemeTokens,
  value: string,
  seen: Set<string> = new Set(),
): string {
  const trimmed = value.trim()
  const m = trimmed.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/i)
  if (!m) return trimmed
  const ref = m[1]
  const fallback = m[2]
  if (seen.has(ref)) return trimmed // cycle guard
  seen.add(ref)
  const referenced = all.get(ref)
  if (referenced !== undefined) return resolveTokenValue(all, referenced, seen)
  if (fallback !== undefined) return resolveTokenValue(all, fallback, seen)
  return trimmed
}

/**
 * The "semantic view" of a theme: only the canonical THEME_TOKEN_KEYS, each with
 * its `var()` references resolved to a literal. Independent of how many palette or
 * component tokens the block declares underneath.
 */
export function resolveThemeTokens(all: ThemeTokens): ThemeTokens {
  const out: ThemeTokens = new Map()
  for (const key of THEME_TOKEN_KEYS) {
    const raw = all.get(key)
    if (raw !== undefined) out.set(key, resolveTokenValue(all, raw))
  }
  return out
}

export interface ContrastResult extends TokenContrastPair {
  ratio: number | null // null when a token is missing/unparseable
  passes: boolean
}

/** Grades one fg/bg pair against `tokens`, chasing var() on both sides first. */
function gradePair(tokens: ThemeTokens, pair: TokenContrastPair): ContrastResult {
  const fgRaw = tokens.get(pair.fg)
  const bgRaw = tokens.get(pair.bg)
  const fg = fgRaw !== undefined ? resolveTokenValue(tokens, fgRaw) : undefined
  const bg = bgRaw !== undefined ? resolveTokenValue(tokens, bgRaw) : undefined
  const ratio = fg && bg ? contrastRatioForHslTriplets(fg, bg) : null
  return { ...pair, ratio, passes: ratio !== null && ratio >= pair.minRatio }
}

/** Grades every CONTRAST_PAIR for one theme's tokens (resolving var() first). */
export function evaluateThemeContrast(tokens: ThemeTokens): ContrastResult[] {
  return CONTRAST_PAIRS.map((pair) => gradePair(tokens, pair))
}

/**
 * The effective tier-3 component tokens for a theme: the shared `:root` defaults
 * (COMPONENT_TOKEN_DEFAULTS) with any component token the theme redeclares winning.
 * Merged onto the theme's own semantic/palette map so a default like
 * `var(--primary)` resolves against *this* theme's primary.
 */
export function componentTokensForTheme(themeTokens: ThemeTokens): ThemeTokens {
  const merged: ThemeTokens = new Map(themeTokens)
  for (const [key, value] of Object.entries(COMPONENT_TOKEN_DEFAULTS)) {
    if (!merged.has(key)) merged.set(key, value)
  }
  return merged
}

/**
 * Grades every COMPONENT_CONTRAST_PAIR for one theme, so a per-theme component
 * override (e.g. a darker `--button-bg`) is held to WCAG AA just like the semantic
 * pairs. Un-overridden themes grade identically to their semantic equivalent.
 */
export function evaluateComponentContrast(themeTokens: ThemeTokens): ContrastResult[] {
  const merged = componentTokensForTheme(themeTokens)
  return COMPONENT_CONTRAST_PAIRS.map((pair) => gradePair(merged, pair))
}

/**
 * Grades the non-text (graphical) fill pairs — a solid chip's FILL vs the surface
 * behind it — at the WCAG 1.4.11 3:1 bar. Catches badges/pills that blend into the
 * page, which the text-only pairs and axe's color-contrast rule both miss.
 */
export function evaluateGraphicalContrast(themeTokens: ThemeTokens): ContrastResult[] {
  const merged = componentTokensForTheme(themeTokens)
  return GRAPHICAL_CONTRAST_PAIRS.map((pair) => gradePair(merged, pair))
}

/** The one token that holds a CSS length rather than an HSL color triplet. */
export const NON_COLOR_TOKENS: ReadonlySet<string> = new Set(['--radius'])

export interface ThemeValidation {
  /** Canonical tokens absent from the theme. */
  missingTokens: string[]
  /** `"<token>: <value>"` for color tokens that aren't HSL triplets. */
  nonHslTokens: string[]
  /** `"<label>: <ratio> (min <min>)"` for pairs below their WCAG threshold. */
  contrastFailures: string[]
}

/** True when a validation found nothing wrong. */
export function isThemeValid(v: ThemeValidation): boolean {
  return (
    v.missingTokens.length === 0 &&
    v.nonHslTokens.length === 0 &&
    v.contrastFailures.length === 0
  )
}

/**
 * Runs all three checks (completeness, HSL-only color tokens, WCAG contrast)
 * against one theme's tokens.  Pure and framework-free so it drives both the
 * CI suite (over themes.css) and runtime validation of user-supplied themes.
 */
export function validateThemeTokens(tokens: ThemeTokens): ThemeValidation {
  const missingTokens = THEME_TOKEN_KEYS.filter((k) => !tokens.has(k))
  const nonHslTokens = [...tokens.entries()]
    .filter(([k]) => !NON_COLOR_TOKENS.has(k))
    .map(([k, v]) => [k, resolveTokenValue(tokens, v)] as const)
    .filter(([, v]) => parseHslTriplet(v) === null)
    .map(([k, v]) => `${k}: ${v}`)
  const contrastFailures = evaluateThemeContrast(tokens)
    .filter((r) => !r.passes)
    .map((r) => `${r.label}: ${r.ratio === null ? 'n/a' : r.ratio.toFixed(2)} (min ${r.minRatio})`)
  return { missingTokens, nonHslTokens, contrastFailures }
}
