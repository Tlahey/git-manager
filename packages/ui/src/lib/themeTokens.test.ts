import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  parseThemeTokens,
  evaluateThemeContrast,
  validateThemeTokens,
  isThemeValid,
  THEME_TOKEN_KEYS,
  NON_COLOR_TOKENS,
  type ThemeTokens,
} from './themeTokens'
import { parseHslTriplet } from './colorContrast'

// vitest runs with cwd = the package root (packages/ui).
const css = readFileSync(resolve(process.cwd(), 'src/globals.css'), 'utf8')
const themes = parseThemeTokens(css)
const themeIds = [...themes.keys()].sort()

// Guard: if this ever parses nothing, every other test would vacuously pass.
describe('parseThemeTokens', () => {
  it('finds all theme blocks in globals.css', () => {
    expect(themeIds.length).toBeGreaterThanOrEqual(12)
    expect(themeIds).toContain('dark')
    expect(themeIds).toContain('light')
    expect(themeIds).toContain('cyberpunk')
  })

  it('ignores descendant selectors like html[data-theme="platinum"] .border', () => {
    // The platinum border-glow override must not pollute the platinum token set.
    const platinum = themes.get('platinum')
    expect(platinum).toBeDefined()
    expect([...(platinum as ThemeTokens).keys()].sort()).toEqual([...THEME_TOKEN_KEYS].sort())
  })
})

// ── Validator 1: structural consistency ─────────────────────────────────────
describe('token consistency across themes', () => {
  it.each(themeIds)('theme "%s" defines exactly the canonical token set', (id) => {
    const tokens = themes.get(id) as ThemeTokens
    const keys = [...tokens.keys()].sort()
    expect(keys).toEqual([...THEME_TOKEN_KEYS].sort())
  })

  // Guarantees no theme smuggles in a raw hex/rgb color that would bypass the
  // token system (and the contrast checker, which only understands HSL triplets).
  it.each(themeIds)('theme "%s" declares every color token as an HSL triplet', (id) => {
    const tokens = themes.get(id) as ThemeTokens
    const bad = [...tokens.entries()]
      .filter(([k]) => !NON_COLOR_TOKENS.has(k))
      .filter(([, v]) => parseHslTriplet(v) === null)
      .map(([k, v]) => `${k}: ${v}`)
    expect(bad, `Non-HSL color tokens in "${id}":\n  ${bad.join('\n  ')}`).toEqual([])
  })
})

// ── Validator 2: WCAG contrast ──────────────────────────────────────────────
//
// Ratchet baseline: semantic pairs that fail WCAG AA *today*, keyed as
// "<themeId>:<pairLabel>".  The suite asserts the live failure set equals this
// baseline exactly, so it catches BOTH regressions (a new failure) AND stale
// entries (a pair that was fixed but not removed here).  Shrinking this list is
// the accessibility backlog — every removal is a theme that now passes AA.
//
// Most failures are `destructive` (light text on saturated red) and `success`
// (light text on green); fixing them means darkening the surface or the
// *-foreground token in globals.css for that theme.
const KNOWN_CONTRAST_FAILURES = new Set<string>([])

describe('theme contrast (WCAG AA)', () => {
  // Full ratio table, printed once for visibility ("dresser l'état actuel").
  it('reports the contrast ratio of every semantic pair', () => {
    const lines: string[] = []
    for (const id of themeIds) {
      for (const r of evaluateThemeContrast(themes.get(id) as ThemeTokens)) {
        const ratio = r.ratio === null ? 'n/a' : r.ratio.toFixed(2)
        lines.push(`${r.passes ? 'PASS' : 'FAIL'}  ${id.padEnd(18)} ${r.label.padEnd(28)} ${ratio} (min ${r.minRatio})`)
      }
    }
    // eslint-disable-next-line no-console
    console.info(`\nTheme contrast report:\n${lines.join('\n')}`)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('has no new contrast failures beyond the known baseline', () => {
    const liveFailures = new Set<string>()
    for (const id of themeIds) {
      for (const r of evaluateThemeContrast(themes.get(id) as ThemeTokens)) {
        if (!r.passes) liveFailures.add(`${id}:${r.label}`)
      }
    }

    const regressions = [...liveFailures].filter((f) => !KNOWN_CONTRAST_FAILURES.has(f)).sort()
    const fixed = [...KNOWN_CONTRAST_FAILURES].filter((f) => !liveFailures.has(f)).sort()

    expect(
      regressions,
      `New contrast failures — either fix the theme or, if intentional, add to KNOWN_CONTRAST_FAILURES:\n  ${regressions.join('\n  ')}`,
    ).toEqual([])
    expect(
      fixed,
      `These pairs now pass AA — remove them from KNOWN_CONTRAST_FAILURES:\n  ${fixed.join('\n  ')}`,
    ).toEqual([])
  })
})

// ── Reusable runtime validator (also used to vet user themes) ────────────────
describe('validateThemeTokens', () => {
  it('reports a clean bill for a fully valid theme', () => {
    // "dark" passes all three checks in globals.css.
    const v = validateThemeTokens(themes.get('dark') as ThemeTokens)
    expect(v).toEqual({ missingTokens: [], nonHslTokens: [], contrastFailures: [] })
    expect(isThemeValid(v)).toBe(true)
  })

  it('flags missing tokens, non-HSL colors and contrast failures together', () => {
    const broken: ThemeTokens = new Map([
      ['--background', '0 0% 100%'],
      ['--foreground', '0 0% 96%'], // near-white on white → contrast fail
      ['--primary', '#ff0000'], // hex → non-HSL fail
      // everything else missing
    ])
    const v = validateThemeTokens(broken)
    expect(v.missingTokens).toContain('--card')
    expect(v.nonHslTokens).toContain('--primary: #ff0000')
    expect(v.contrastFailures.some((f) => f.startsWith('foreground/background'))).toBe(true)
    expect(isThemeValid(v)).toBe(false)
  })

  it('excludes --radius from the HSL requirement', () => {
    const tokens: ThemeTokens = new Map(THEME_TOKEN_KEYS.map((k) => [k, '0 0% 50%']))
    tokens.set('--radius', '0.5rem')
    expect(validateThemeTokens(tokens).nonHslTokens).toEqual([])
    expect(NON_COLOR_TOKENS.has('--radius')).toBe(true)
  })
})
