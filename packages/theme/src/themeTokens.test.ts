import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  parseThemeTokens,
  resolveTokenValue,
  resolveThemeTokens,
  evaluateThemeContrast,
  evaluateComponentContrast,
  componentTokensForTheme,
  validateThemeTokens,
  isThemeValid,
  THEME_TOKEN_KEYS,
  NON_COLOR_TOKENS,
  COMPONENT_TOKEN_DEFAULTS,
  COMPONENT_CONTRAST_PAIRS,
  evaluateGraphicalContrast,
  GRAPHICAL_CONTRAST_PAIRS,
  evaluateApcaComponentContrast,
  APCA_MIN_UI_TEXT,
  type ThemeTokens,
} from './themeTokens'
import { parseHslTriplet } from './colorContrast'

// vitest runs with cwd = the package root (packages/theme). Themes are one file
// per theme under src/themes/; concatenate them all so a new theme file is picked
// up automatically.
const themesDir = resolve(process.cwd(), 'src/themes')
const css = readdirSync(themesDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(resolve(themesDir, f), 'utf8'))
  .join('\n')
const themes = parseThemeTokens(css)
const themeIds = [...themes.keys()].sort()

// Guard: if this ever parses nothing, every other test would vacuously pass.
describe('parseThemeTokens', () => {
  it('finds all theme blocks in themes.css', () => {
    expect(themeIds.length).toBeGreaterThanOrEqual(12)
    expect(themeIds).toContain('dark')
    expect(themeIds).toContain('light')
    expect(themeIds).toContain('cyberpunk')
    expect(themeIds).toContain('twilight')
  })

  it('ignores descendant selectors like html[data-theme="platinum"] .border', () => {
    // The platinum border-glow override must not pollute the platinum token set.
    // Platinum declares every canonical semantic token plus a few component-token
    // overrides (its APCA button fixes); the descendant `.border` selector sets no
    // custom properties, so the only keys present must be canonical or recognised
    // component tokens — anything else would be leaked selector pollution.
    const platinum = themes.get('platinum') as ThemeTokens
    expect(platinum).toBeDefined()
    const allowed = new Set([...THEME_TOKEN_KEYS, ...Object.keys(COMPONENT_TOKEN_DEFAULTS)])
    const missing = THEME_TOKEN_KEYS.filter((k) => !platinum.has(k))
    const leaked = [...platinum.keys()].filter((k) => !allowed.has(k))
    expect(missing, `Missing canonical tokens: ${missing.join(', ')}`).toEqual([])
    expect(leaked, `Unexpected (leaked) tokens: ${leaked.join(', ')}`).toEqual([])
  })
})

// ── Validator 1: structural consistency ─────────────────────────────────────
describe('token consistency across themes', () => {
  // Subset (not equality): a theme may now declare extra palette/component
  // primitives (e.g. --brand-500) alongside the canonical semantic tokens. The
  // platinum exact-set test below still guards against selector pollution.
  it.each(themeIds)('theme "%s" defines every canonical token', (id) => {
    const tokens = themes.get(id) as ThemeTokens
    const missing = THEME_TOKEN_KEYS.filter((k) => !tokens.has(k))
    expect(missing, `Missing canonical tokens in "${id}": ${missing.join(', ')}`).toEqual([])
  })

  // Guarantees no theme smuggles in a raw hex/rgb color that would bypass the
  // token system (and the contrast checker, which only understands HSL triplets).
  // Values are var()-resolved first so a semantic token referencing the palette
  // (--primary: var(--brand-500)) is graded on its resolved triplet.
  it.each(themeIds)('theme "%s" declares every color token as an HSL triplet', (id) => {
    const tokens = themes.get(id) as ThemeTokens
    const bad = [...tokens.entries()]
      .filter(([k]) => !NON_COLOR_TOKENS.has(k))
      .map(([k, v]) => [k, resolveTokenValue(tokens, v)] as const)
      .filter(([, v]) => parseHslTriplet(v) === null)
      .map(([k, v]) => `${k}: ${v}`)
    expect(bad, `Non-HSL color tokens in "${id}":\n  ${bad.join('\n  ')}`).toEqual([])
  })
})

// ── Layered tokens: var() resolution (palette → semantic → component) ─────────
describe('resolveTokenValue / resolveThemeTokens', () => {
  it('chases a var() chain to its literal', () => {
    const m: ThemeTokens = new Map([
      ['--brand-500', '258 90% 68%'],
      ['--primary', 'var(--brand-500)'],
      ['--ring', 'var(--primary)'],
    ])
    expect(resolveTokenValue(m, m.get('--ring') as string)).toBe('258 90% 68%')
  })

  it('uses the fallback when the reference is absent', () => {
    expect(resolveTokenValue(new Map(), 'var(--nope, 0 0% 50%)')).toBe('0 0% 50%')
  })

  it('leaves a dangling reference as-is so the HSL check flags it', () => {
    expect(resolveTokenValue(new Map(), 'var(--nope)')).toBe('var(--nope)')
  })

  it('guards against reference cycles instead of overflowing the stack', () => {
    const m: ThemeTokens = new Map([
      ['--a', 'var(--b)'],
      ['--b', 'var(--a)'],
    ])
    expect(() => resolveTokenValue(m, 'var(--a)')).not.toThrow()
  })

  it('returns the canonical set with palette references resolved (twilight)', () => {
    const tw = themes.get('twilight') as ThemeTokens
    const resolved = resolveThemeTokens(tw)
    expect([...resolved.keys()].sort()).toEqual([...THEME_TOKEN_KEYS].sort())
    // --primary points at the violet palette primitive.
    expect(resolved.get('--primary')).toBe('258 90% 68%')
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
// *-foreground token in themes.css for that theme.
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
    // "dark" passes all three checks in themes.css.
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

// ── Tier 3: component tokens ─────────────────────────────────────────────────
//
// The `:root` component defaults live in src/themes.css (the runtime source) and
// must mirror COMPONENT_TOKEN_DEFAULTS (the grader's source of truth). This guard
// fails if they drift, so a token added in one place can't be forgotten in the
// other.
describe('component token defaults (CSS ↔ TS parity)', () => {
  const rootCss = readFileSync(resolve(process.cwd(), 'src/themes.css'), 'utf8')
  const rootBlock = rootCss.match(/:root\s*\{([^{}]*)\}/)?.[1] ?? ''
  const cssDefaults = new Map(
    [...rootBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  )

  it('themes.css :root declares exactly COMPONENT_TOKEN_DEFAULTS', () => {
    expect([...cssDefaults.keys()].sort()).toEqual(Object.keys(COMPONENT_TOKEN_DEFAULTS).sort())
    for (const [k, v] of Object.entries(COMPONENT_TOKEN_DEFAULTS)) {
      expect(cssDefaults.get(k), `value drift for ${k}`).toBe(v)
    }
  })
})

describe('componentTokensForTheme / evaluateComponentContrast', () => {
  it('falls back to the shared defaults, resolved against the theme (button → primary)', () => {
    // "github-light" declares no --button-bg override (its deep primary already
    // clears APCA) → --button-bg defaults to var(--primary), resolved against its own
    // primary. (Most themes now pin --button-bg explicitly for the APCA restyle.)
    const gh = themes.get('github-light') as ThemeTokens
    const merged = componentTokensForTheme(gh)
    expect(resolveTokenValue(merged, merged.get('--button-bg') as string)).toBe(
      resolveTokenValue(gh, gh.get('--primary') as string),
    )
  })

  it('applies a per-theme component override (twilight deepens the button fill for APCA)', () => {
    const tw = themes.get('twilight') as ThemeTokens
    const merged = componentTokensForTheme(tw)
    // Twilight re-points --button-bg to the deeper --brand-600 (light label), not --primary.
    const buttonBg = resolveTokenValue(merged, merged.get('--button-bg') as string)
    const primary = resolveTokenValue(tw, tw.get('--primary') as string)
    expect(buttonBg).not.toBe(primary)
    const button = evaluateComponentContrast(tw).find((r) => r.label === 'button')
    expect(button?.passes).toBe(true)
    expect(button?.ratio ?? 0).toBeGreaterThanOrEqual(4.5)
  })

  it('grades the default badge, and twilight overrides it to a more visible AA fill', () => {
    const tw = themes.get('twilight') as ThemeTokens
    const merged = componentTokensForTheme(tw)
    const badgeBg = resolveTokenValue(merged, merged.get('--badge-bg') as string)
    const primary = resolveTokenValue(tw, tw.get('--primary') as string)
    // Twilight re-points --badge-bg off the marginal --primary (~4.9:1).
    expect(badgeBg).not.toBe(primary)
    const badge = evaluateComponentContrast(tw).find((r) => r.label === 'badge')
    expect(badge?.passes).toBe(true)
    expect(badge?.ratio ?? 0).toBeGreaterThanOrEqual(4.5)
  })

  it('lets a theme override a component token, and re-grades the override', () => {
    const base = themes.get('twilight') as ThemeTokens
    const overridden: ThemeTokens = new Map(base)
    // Point the button at a near-white fill with near-white text → must fail AA.
    overridden.set('--button-bg', '0 0% 100%')
    overridden.set('--button-foreground', '0 0% 96%')
    const button = evaluateComponentContrast(overridden).find((r) => r.label === 'button')
    expect(button?.passes).toBe(false)
  })

  it('grades every component pair for every theme with no failures beyond baseline', () => {
    const KNOWN_COMPONENT_FAILURES = new Set<string>([])
    const liveFailures = new Set<string>()
    for (const id of themeIds) {
      for (const r of evaluateComponentContrast(themes.get(id) as ThemeTokens)) {
        if (!r.passes) liveFailures.add(`${id}:${r.label}`)
      }
    }
    const regressions = [...liveFailures].filter((f) => !KNOWN_COMPONENT_FAILURES.has(f)).sort()
    expect(
      regressions,
      `New component-token contrast failures:\n  ${regressions.join('\n  ')}`,
    ).toEqual([])
    // Sanity: the pair set is actually being graded.
    expect(COMPONENT_CONTRAST_PAIRS.length).toBeGreaterThan(0)
  })
})

// ── Non-text (graphical) contrast — WCAG 1.4.11 ──────────────────────────────
//
// The badge/pill FILL vs the surface behind it. axe's color-contrast rule is
// text-only, so a count badge that blends into the page is invisible to the story
// matrix — this is where that class of issue is caught. Ratchet baseline: fills
// that fall below the 3:1 bar today. Shrinking it means a badge that now pops.
// Empty: dark/amethyst/forest previously had deep-red destructive badge fills under
// 3:1 vs their near-black surfaces; each now pins a light-red --badge-destructive-bg
// (pops ~10-12:1) + near-black label, so every graded graphical pair clears 1.4.11.
const KNOWN_GRAPHICAL_FAILURES = new Set<string>([])

describe('non-text (graphical) contrast — WCAG 1.4.11', () => {
  it('reports each theme’s badge-fill vs surface ratio', () => {
    const lines: string[] = []
    for (const id of themeIds) {
      for (const r of evaluateGraphicalContrast(themes.get(id) as ThemeTokens)) {
        const ratio = r.ratio === null ? 'n/a' : r.ratio.toFixed(2)
        lines.push(`${r.passes ? 'PASS' : 'FAIL'}  ${id.padEnd(18)} ${r.label.padEnd(24)} ${ratio} (min ${r.minRatio})`)
      }
    }
    // eslint-disable-next-line no-console
    console.info(`\nGraphical (non-text) contrast report:\n${lines.join('\n')}`)
    expect(GRAPHICAL_CONTRAST_PAIRS.length).toBeGreaterThan(0)
  })

  it('has no badge fill that blends into its surface beyond the known baseline', () => {
    const liveFailures = new Set<string>()
    for (const id of themeIds) {
      for (const r of evaluateGraphicalContrast(themes.get(id) as ThemeTokens)) {
        if (!r.passes) liveFailures.add(`${id}:${r.label}`)
      }
    }
    const regressions = [...liveFailures].filter((f) => !KNOWN_GRAPHICAL_FAILURES.has(f)).sort()
    const fixed = [...KNOWN_GRAPHICAL_FAILURES].filter((f) => !liveFailures.has(f)).sort()
    expect(
      regressions,
      `Badge fills that blend into their surface (add a popping --badge-bg override or accept):\n  ${regressions.join('\n  ')}`,
    ).toEqual([])
    expect(
      fixed,
      `These badge fills now pass 1.4.11 — remove from KNOWN_GRAPHICAL_FAILURES:\n  ${fixed.join('\n  ')}`,
    ).toEqual([])
  })
})

// ── APCA perceptual contrast (WCAG 3 draft) ──────────────────────────────────
//
// The WCAG-2.x component check above can pass a pair that reads poorly (the blue
// count badge: WCAG 4.85 but APCA Lc ~39, which Chrome DevTools flags). APCA grades
// the same component labels perceptually. Ratchet baseline: label pairs below the
// APCA UI bar today — all `button*` fills (which still ride --primary/--destructive/
// --success). The count badge was fixed (per-theme --badge-bg overrides), so no badge
// entry remains here. Shrinking this list = a button that now reads perceptually.
// Emptied: every theme's filled button/badge label now clears the APCA UI bar after
// the polarity-based restyle (dark-content themes lighten the fill + keep a dark label,
// light-content themes deepen the fill + use a light label). See the per-theme
// --button-*/--badge-*/--link overrides in packages/theme/src/themes/*.css.
const KNOWN_APCA_FAILURES = new Set<string>([])

describe(`APCA perceptual contrast (component labels, |Lc| ≥ ${APCA_MIN_UI_TEXT})`, () => {
  it('reports each theme’s component-label APCA Lc', () => {
    const lines: string[] = []
    for (const id of themeIds) {
      for (const r of evaluateApcaComponentContrast(themes.get(id) as ThemeTokens)) {
        const lc = r.lc === null ? 'n/a' : r.lc.toFixed(1)
        lines.push(`${r.passes ? 'PASS' : 'FAIL'}  ${id.padEnd(18)} ${r.label.padEnd(20)} Lc ${lc} (min ${r.minLc})`)
      }
    }
    // eslint-disable-next-line no-console
    console.info(`\nAPCA component-label report:\n${lines.join('\n')}`)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('has no component label below the APCA bar beyond the known baseline', () => {
    const liveFailures = new Set<string>()
    for (const id of themeIds) {
      for (const r of evaluateApcaComponentContrast(themes.get(id) as ThemeTokens)) {
        if (!r.passes) liveFailures.add(`${id}:${r.label}`)
      }
    }
    const regressions = [...liveFailures].filter((f) => !KNOWN_APCA_FAILURES.has(f)).sort()
    const fixed = [...KNOWN_APCA_FAILURES].filter((f) => !liveFailures.has(f)).sort()
    expect(
      regressions,
      `New APCA-unreadable component labels (fix the token or add to KNOWN_APCA_FAILURES):\n  ${regressions.join('\n  ')}`,
    ).toEqual([])
    expect(
      fixed,
      `These labels now clear the APCA bar — remove from KNOWN_APCA_FAILURES:\n  ${fixed.join('\n  ')}`,
    ).toEqual([])
  })
})
