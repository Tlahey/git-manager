// ─── @git-manager/theme — single source of truth for the app's themes ────────
//
// Owns the CSS token blocks (themes.css, imported by @git-manager/ui/globals.css),
// the picker registry (registry.ts), the runtime Monaco token map (monaco.ts),
// and the accessibility/consistency validation engine (themeTokens.ts +
// colorContrast.ts).  Storybook and the integrity tests in this package validate
// every theme's completeness, HSL correctness, and WCAG contrast.

// Registry (picker metadata)
export type { ThemeDefinition, ThemeVibrancy, GlassBlurMode } from './registry'
export {
  BUILTIN_THEMES,
  getBuiltinTheme,
  vibrancyForTheme,
  windowMaterialForTheme,
  windowAppearanceForTheme,
  DEFAULT_GLASS_BLUR_MODE,
} from './registry'

// Glass material: how see-through a translucent theme renders (user setting)
export type { GlassAlphas } from './glassTransparency'
export {
  DEFAULT_GLASS_TRANSPARENCY,
  GLASS_TRANSPARENCY_VARS,
  clampGlassTransparency,
  glassAlphasForLevel,
  glassTransparencyVars,
} from './glassTransparency'

// Validation engine (accessibility / token consistency)
export {
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
  CONTRAST_PAIRS,
  COMPONENT_CONTRAST_PAIRS,
  COMPONENT_TOKEN_DEFAULTS,
  AA_NORMAL_TEXT,
  AA_LARGE_TEXT,
} from './themeTokens'
export type {
  ThemeTokens,
  ThemeValidation,
  ContrastPair,
  TokenContrastPair,
  ContrastResult,
} from './themeTokens'

export {
  parseHslTriplet,
  hslToRgb,
  relativeLuminance,
  contrastRatio,
  contrastRatioForHslTriplets,
} from './colorContrast'
export type { Rgb } from './colorContrast'

// Monaco editor token map (resolved at runtime by packages/editor)
export { MONACO_DYNAMIC_TOKEN_MAP } from './monaco'
export type { MonacoTokenBinding } from './monaco'
