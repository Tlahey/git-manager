// ─── Theme token model & accessibility contract ─────────────────────────────
//
// The app's themes are semantic-token sets (shadcn style) declared in
// globals.css as `html[data-theme="<id>"] { --token: <hsl triplet>; ... }`.
// This module parses those blocks and encodes two invariants the test suite
// (themeAccessibility.test.ts) enforces across every theme:
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

import { contrastRatioForHslTriplets, parseHslTriplet } from './colorContrast'

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
export interface ContrastPair {
  label: string
  fg: (typeof THEME_TOKEN_KEYS)[number]
  bg: (typeof THEME_TOKEN_KEYS)[number]
  minRatio: number
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

export type ThemeTokens = Map<string, string>

/**
 * Parses globals.css into a map of `themeId -> (token -> raw value)`.
 *
 * Handles selector lists like `:root, html[data-theme="dark"] { ... }` by
 * attributing the block to every `data-theme` id it names.  Blocks that carry
 * no `data-theme` id (pure `:root`, animation-only rules, `.avatar-frame-*`,
 * theme-scoped overrides such as `html[data-theme="platinum"] .border`) are
 * skipped — only top-level theme token declarations are collected.
 */
export function parseThemeTokens(css: string): Map<string, ThemeTokens> {
  const themes = new Map<string, ThemeTokens>()
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
    for (const decl of body.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) {
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

export interface ContrastResult extends ContrastPair {
  ratio: number | null // null when a token is missing/unparseable
  passes: boolean
}

/** Grades every CONTRAST_PAIR for one theme's tokens. */
export function evaluateThemeContrast(tokens: ThemeTokens): ContrastResult[] {
  return CONTRAST_PAIRS.map((pair) => {
    const fg = tokens.get(pair.fg)
    const bg = tokens.get(pair.bg)
    const ratio = fg && bg ? contrastRatioForHslTriplets(fg, bg) : null
    return { ...pair, ratio, passes: ratio !== null && ratio >= pair.minRatio }
  })
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
 * CI suite (over globals.css) and runtime validation of user-supplied themes.
 */
export function validateThemeTokens(tokens: ThemeTokens): ThemeValidation {
  const missingTokens = THEME_TOKEN_KEYS.filter((k) => !tokens.has(k))
  const nonHslTokens = [...tokens.entries()]
    .filter(([k]) => !NON_COLOR_TOKENS.has(k))
    .filter(([, v]) => parseHslTriplet(v) === null)
    .map(([k, v]) => `${k}: ${v}`)
  const contrastFailures = evaluateThemeContrast(tokens)
    .filter((r) => !r.passes)
    .map((r) => `${r.label}: ${r.ratio === null ? 'n/a' : r.ratio.toFixed(2)} (min ${r.minRatio})`)
  return { missingTokens, nonHslTokens, contrastFailures }
}
