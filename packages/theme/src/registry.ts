// ─── Theme registry (picker metadata) ───────────────────────────────────────
//
// `colors` holds hex values used to render the swatch previews in the Settings
// theme picker.  They are the exact sRGB conversions of the `--background`,
// `--foreground`, `--primary` and `--accent` HSL tokens for each theme in
// themes.css, so the preview matches what actually renders.  Keep them in sync
// when editing the CSS — registry.test.ts fails if a swatch drifts more than a
// few units per channel from its token.

/**
 * The native window material a theme asks for behind the webview (macOS only).
 * Only a theme that leaves regions of the page unpainted wants one — with an
 * effect installed, anything without an opaque background becomes see-through.
 */
export type ThemeVibrancy = 'sidebar' | 'hud' | 'under-window'

export interface ThemeDefinition {
  id: string
  /** i18n key: settings.appearance.theme.<id> */
  labelKey: string
  /** Swatch preview colors (hex).  `null` for the "system" pseudo-theme. */
  colors: { bg: string; fg: string; primary: string; accent: string } | null
  isDark: boolean
  /** Native window material; absent means an ordinary opaque window. */
  vibrancy?: ThemeVibrancy
}

export const BUILTIN_THEMES: ThemeDefinition[] = [
  {
    id: 'system',
    labelKey: 'settings.appearance.theme.system',
    colors: null,
    isDark: false,
  },
  {
    id: 'dark',
    labelKey: 'settings.appearance.theme.dark',
    colors: { bg: '#020817', fg: '#f8fafc', primary: '#3b82f6', accent: '#1e293b' },
    isDark: true,
  },
  {
    id: 'light',
    labelKey: 'settings.appearance.theme.light',
    colors: { bg: '#ffffff', fg: '#020817', primary: '#3b82f6', accent: '#f1f5f9' },
    isDark: false,
  },
  {
    id: 'github-light',
    labelKey: 'settings.appearance.theme.github-light',
    colors: { bg: '#ffffff', fg: '#242529', primary: '#036be2', accent: '#edf0f2' },
    isDark: false,
  },
  {
    id: 'github-dark',
    labelKey: 'settings.appearance.theme.github-dark',
    colors: { bg: '#101114', fg: '#e7ebee', primary: '#2e8bf5', accent: '#292d33' },
    isDark: true,
  },
  {
    id: 'nord',
    labelKey: 'settings.appearance.theme.nord',
    colors: { bg: '#2f3541', fg: '#eceff4', primary: '#8ac1d0', accent: '#8da6c4' },
    isDark: true,
  },
  {
    id: 'dracula',
    labelKey: 'settings.appearance.theme.dracula',
    colors: { bg: '#272935', fg: '#f8f8f2', primary: '#bf95f9', accent: '#44475a' },
    isDark: true,
  },
  {
    id: 'catppuccin-mocha',
    labelKey: 'settings.appearance.theme.catppuccin-mocha',
    colors: { bg: '#1c1c2b', fg: '#cdd6f4', primary: '#cba6f7', accent: '#464858' },
    isDark: true,
  },
  {
    id: 'solarized-light',
    labelKey: 'settings.appearance.theme.solarized-light',
    colors: { bg: '#fdf6e2', fg: '#073541', primary: '#2075b1', accent: '#ede7d4' },
    isDark: false,
  },
  {
    id: 'twilight',
    labelKey: 'settings.appearance.theme.twilight',
    colors: { bg: '#f9fafb', fg: '#020817', primary: '#9064f7', accent: '#edeff3' },
    isDark: false,
  },
  {
    id: 'amethyst',
    labelKey: 'settings.appearance.theme.amethyst',
    colors: { bg: '#0f0915', fg: '#f2f0f5', primary: '#be5eed', accent: '#261f2e' },
    isDark: true,
  },
  {
    id: 'forest',
    labelKey: 'settings.appearance.theme.forest',
    colors: { bg: '#0b140e', fg: '#f0f5f1', primary: '#2eb867', accent: '#212c24' },
    isDark: true,
  },
  {
    id: 'cyberpunk',
    labelKey: 'settings.appearance.theme.cyberpunk',
    colors: { bg: '#12080e', fg: '#d6ffff', primary: '#ff33bb', accent: '#ffff00' },
    isDark: true,
  },
  {
    id: 'platinum',
    labelKey: 'settings.appearance.theme.platinum',
    colors: { bg: '#14161a', fg: '#f9fafa', primary: '#80ffff', accent: '#ff80ff' },
    isDark: true,
  },
  {
    // Translucent-material theme; the swatch shows its composited (opaque
    // equivalent) tokens, which is also what the contrast graders score.
    id: 'glass',
    labelKey: 'settings.appearance.theme.glass',
    colors: { bg: '#f8f9fb', fg: '#0f1729', primary: '#3b93f7', accent: '#ebeff4' },
    isDark: false,
    // UnderWindowBackground because it is the material AppKit provides for a whole
    // translucent window. Note: on macOS 26 in light appearance, `sidebar` and
    // `under-window` build a byte-identical layer tree (measured), so the choice is
    // cosmetic there — which is why this is not exposed as a user setting. It may
    // still differ on other OS versions or in dark appearance.
    vibrancy: 'under-window',
  },
]

export function getBuiltinTheme(id: string): ThemeDefinition | undefined {
  return BUILTIN_THEMES.find((t) => t.id === id)
}

/**
 * The window material to install for a theme id — `'none'` for every theme that
 * doesn't ask for one, including unknown/user themes. Callers pass the result
 * straight to the native side, so the fallback has to be explicit rather than
 * undefined: switching *away* from a glass theme must actively clear the effect,
 * otherwise the window stays transparent under an opaque theme.
 */
export function vibrancyForTheme(id: string): ThemeVibrancy | 'none' {
  return getBuiltinTheme(id)?.vibrancy ?? 'none'
}

/**
 * The native window appearance to pin for a theme id.
 *
 * Only a theme carrying a window material needs one: AppKit's semantic materials
 * render against the window's appearance, so a *light* glass theme on a Mac in
 * dark mode would get a dark material under light tokens. Every other theme
 * returns `'system'`, handing the appearance back to the OS — pinning it would
 * otherwise leak: the setting is app-wide on macOS and would survive the switch
 * to a theme that never asked for it.
 */
export function windowAppearanceForTheme(id: string): 'light' | 'dark' | 'system' {
  const theme = getBuiltinTheme(id)
  if (!theme?.vibrancy) return 'system'
  return theme.isDark ? 'dark' : 'light'
}
