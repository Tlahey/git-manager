// ─── Runtime validation of user-supplied themes ─────────────────────────────
//
// User themes are loaded from ~/.git-manager/themes/ and injected as raw CSS at
// runtime (see useTheme.ts), so they never go through the CI suite that guards
// the built-in themes.  This runs the same accessibility/consistency checks on
// them at load time and surfaces problems in the console instead of letting a
// custom theme silently ship white-on-yellow text or half its tokens.

import { parseThemeTokens, validateThemeTokens, isThemeValid } from '@git-manager/theme'
import type { UserTheme } from '@git-manager/git-types'

/**
 * Validates one user theme's CSS and warns (once) when it defines theme tokens
 * that are incomplete, non-HSL, or fail WCAG contrast.  A no-op when the CSS
 * contains no recognizable `html[data-theme]` token block, so purely cosmetic
 * user CSS is left alone.  `warn` is injectable for testing.
 */
export function warnOnInvalidUserTheme(theme: UserTheme, warn: typeof console.warn = console.warn): void {
  const parsed = parseThemeTokens(theme.css)
  // Prefer the block matching the theme id; fall back to the first block found.
  const tokens = parsed.get(theme.id) ?? [...parsed.values()][0]
  if (!tokens) return

  const validation = validateThemeTokens(tokens)
  if (isThemeValid(validation)) return

  warn(
    `[theme] User theme "${theme.id}" (${theme.name}) has accessibility/consistency issues:`,
    validation,
  )
}
