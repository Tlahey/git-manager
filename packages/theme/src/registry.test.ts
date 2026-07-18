import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseThemeTokens, resolveTokenValue } from './themeTokens'
import { parseHslTriplet, hslToRgb } from './colorContrast'
import { BUILTIN_THEMES } from './registry'

// vitest runs with cwd = packages/theme; tokens live one file per theme under
// src/themes/. Concatenate them all before parsing.
const themesDir = resolve(process.cwd(), 'src/themes')
const css = readdirSync(themesDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(resolve(themesDir, f), 'utf8'))
  .join('\n')
const cssThemes = parseThemeTokens(css)

const registered = BUILTIN_THEMES.filter((t) => t.id !== 'system')

// ── Registration parity: picker list ⇔ themes.css ───────────────────────────
describe('theme registration parity', () => {
  it('every non-system theme in the picker has a themes.css block', () => {
    const missing = registered.filter((t) => !cssThemes.has(t.id)).map((t) => t.id)
    expect(missing, `Registered in registry.ts but no CSS block: ${missing.join(', ')}`).toEqual([])
  })

  it('every themes.css theme is registered in the picker', () => {
    const registeredIds = new Set(registered.map((t) => t.id))
    const orphan = [...cssThemes.keys()].filter((id) => !registeredIds.has(id))
    expect(orphan, `CSS block with no registry entry: ${orphan.join(', ')}`).toEqual([])
  })
})

// ── Swatch drift: the picker preview vs the real theme tokens ────────────────
//
// BUILTIN_THEMES.colors are hex previews that mirror the CSS tokens (see the
// comment in registry.ts).  This ratchet caps drift at TOLERANCE per RGB channel;
// the baseline is empty because the swatches are currently exact conversions of
// the tokens.  If you edit themes.css without updating the swatch, this fails —
// re-derive the hex (see the node snippet in the PR) or add it to the baseline.
const TOLERANCE = 8

const SWATCH_TO_TOKEN: Record<'bg' | 'fg' | 'primary' | 'accent', string> = {
  bg: '--background',
  fg: '--foreground',
  primary: '--primary',
  accent: '--accent',
}

const KNOWN_SWATCH_DRIFT = new Set<string>([])

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function maxChannelDelta(hex: string, hslTriplet: string): number | null {
  const hsl = parseHslTriplet(hslTriplet)
  if (!hsl) return null
  const { r, g, b } = hslToRgb(hsl.h, hsl.s, hsl.l)
  const [sr, sg, sb] = hexToRgb(hex)
  return Math.max(Math.abs(r - sr), Math.abs(g - sg), Math.abs(b - sb))
}

describe('swatch preview drift', () => {
  it('has no new swatch drift beyond the known baseline', () => {
    const liveDrift = new Set<string>()
    for (const theme of registered) {
      const tokens = cssThemes.get(theme.id)
      if (!tokens || !theme.colors) continue
      for (const [swatchKey, tokenName] of Object.entries(SWATCH_TO_TOKEN)) {
        const rawValue = tokens.get(tokenName)
        // Resolve var() so a palette-referencing theme (twilight) is still checked.
        const tokenValue = rawValue !== undefined ? resolveTokenValue(tokens, rawValue) : undefined
        const hex = theme.colors[swatchKey as keyof typeof theme.colors]
        if (!tokenValue || !hex) continue
        const delta = maxChannelDelta(hex, tokenValue)
        if (delta !== null && delta > TOLERANCE) liveDrift.add(`${theme.id}:${swatchKey}`)
      }
    }

    const regressions = [...liveDrift].filter((d) => !KNOWN_SWATCH_DRIFT.has(d)).sort()
    const fixed = [...KNOWN_SWATCH_DRIFT].filter((d) => !liveDrift.has(d)).sort()

    expect(
      regressions,
      `Swatch preview drifted from the CSS token (>${TOLERANCE}/channel). Align the hex in registry.ts:\n  ${regressions.join('\n  ')}`,
    ).toEqual([])
    expect(
      fixed,
      `These swatches now match the CSS — remove them from KNOWN_SWATCH_DRIFT:\n  ${fixed.join('\n  ')}`,
    ).toEqual([])
  })
})
