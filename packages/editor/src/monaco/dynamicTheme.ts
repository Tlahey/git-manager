import type * as monaco from 'monaco-editor'
import { MONACO_DYNAMIC_TOKEN_MAP } from '@git-manager/theme'

/** The theme that follows the *host app's* colors instead of shipping its own.
 *
 * Separate from `themes.ts`, which is a data table: the themes there are fixed palettes written
 * out in full, while everything here is runtime — resolving CSS custom properties off the live
 * document, converting them into the hex Monaco accepts, and deciding light vs dark from the
 * result. The two only meet at `monaco.editor.defineTheme`.
 *
 * There is no Monaco API for "use these CSS variables", hence the conversion: `defineTheme` takes
 * literal color strings, so the app's tokens have to be read and translated on every apply. */

function hslToHex(h: number, s: number, l: number, a?: number): string {
  s /= 100
  l /= 100

  const k = (n: number) => (n + h / 30) % 12
  const f = (n: number) => {
    const aVal = s * Math.min(l, 1 - l)
    const color = l - aVal * Math.max(Math.min(k(n) - 3, 9 - k(n), 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }

  const hexRGB = `#${f(0)}${f(8)}${f(4)}`

  if (a !== undefined) {
    const alphaHex = Math.round(a * 255)
      .toString(16)
      .padStart(2, '0')
    return `${hexRGB}${alphaHex}`
  }

  return hexRGB
}

function colorToHex(colorStr: string, alpha?: number): string {
  const clean = colorStr.trim()
  if (clean.startsWith('#')) {
    let hex = clean
    if (hex.length === 4) {
      // e.g. #fff
      hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
    }
    if (alpha !== undefined) {
      const alphaHex = Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0')
      return `${hex.slice(0, 7)}${alphaHex}`
    }
    return hex
  }

  // Parse space-separated HSL components (e.g., "222.2 84% 4.9%")
  const parts = clean.split(/\s+/)
  if (parts.length >= 3) {
    const h = parseFloat(parts[0])
    const s = parseFloat(parts[1].replace('%', ''))
    const l = parseFloat(parts[2].replace('%', ''))
    if (!isNaN(h) && !isNaN(s) && !isNaN(l)) {
      return hslToHex(h, s, l, alpha)
    }
  }

  return clean
}

// Helper to retrieve and format CSS variables as colors
function getMonacoColorFromCssVar(varName: string, alpha?: number): string {
  if (typeof window === 'undefined') return ''
  const rawValue = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!rawValue) {
    if (varName === '--background') return '#000000'
    if (varName === '--foreground') return '#ffffff'
    return '#888888'
  }

  return colorToHex(rawValue, alpha)
}

function isBackgroundDark(): boolean {
  if (typeof window === 'undefined') return true
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
  const parts = bg.split(/\s+/)
  if (parts.length >= 3) {
    const lightnessStr = parts[2]
    const lightness = parseFloat(lightnessStr)
    if (!isNaN(lightness)) {
      return lightness < 50
    }
  }
  return true // fallback to dark
}

// `defineTheme` with `inherit: true` makes Monaco recompute its TokenTheme from the *shared,
// module-level* built-in rule table (`vs`/`vs-dark` in monaco-editor's own
// standaloneThemeService.js) — and that recompute path mutates the shared table in place (appends
// an `{ token: '' }` default-color rule to it) rather than copying it first. Every call to
// `defineTheme` therefore leaks one more entry into a table that lives for the process's lifetime,
// regardless of theme name — a session with many editor mounts (every diff/merge pane calls this
// on mount) grows it unbounded, which is a real cost once the theme's CSS actually applies (it
// used to be silently dropped by a CSP gap; see tauri.conf.json's style-src). We can't fix
// monaco-editor's internals, so avoid re-triggering them: skip `defineTheme` (and the fresh
// `StandaloneTheme` — and fresh shared-table mutation — that recomputing its `.tokenTheme` getter
// causes) unless the resolved colors actually changed since the last call. `setTheme` alone is
// cheap and reuses the previously-defined (already-tokenized) theme instance.
let lastAppliedThemeSignature: string | null = null

/** Test-only: clears the memo so a fresh assertion can observe the next `defineTheme` call. */
export function resetDynamicThemeMemo(): void {
  lastAppliedThemeSignature = null
}

export function registerAndApplyDynamicTheme(monacoInstance: typeof monaco | null | undefined) {
  if (!monacoInstance) return

  const isDark = isBackgroundDark()
  // Resolve every Monaco color key from its CSS token via the declarative map
  // owned by @git-manager/theme (single source of truth for the token→editor
  // mapping). Constants (e.g. transparent borders) are used verbatim.
  const colors: Record<string, string> = {}
  for (const binding of MONACO_DYNAMIC_TOKEN_MAP) {
    colors[binding.key] =
      binding.constant ?? getMonacoColorFromCssVar(binding.cssVar as string, binding.alpha)
  }
  const base = isDark ? 'vs-dark' : 'vs'
  const signature = `${base}|${JSON.stringify(colors)}`

  try {
    if (signature !== lastAppliedThemeSignature) {
      monacoInstance.editor.defineTheme('git-manager-dynamic', {
        base,
        inherit: true,
        rules: [],
        colors,
      })
      lastAppliedThemeSignature = signature
    }
    monacoInstance.editor.setTheme('git-manager-dynamic')
  } catch (error) {
    console.error('Failed to define or apply dynamic Monaco theme', error)
  }
}
