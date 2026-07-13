// ─── Theme definitions ────────────────────────────────────────────────────────
//
// `colors` holds hex values used to render the swatch previews in the Settings
// theme picker.  They are the exact sRGB conversions of the `--background`,
// `--foreground`, `--primary` and `--accent` HSL tokens for each theme in
// packages/ui/src/globals.css, so the preview matches what actually renders.
// Keep them in sync when editing the CSS — themesRegistry.test.ts fails if a
// swatch drifts more than a few units per channel from its token.

export interface ThemeDefinition {
  id: string
  /** i18n key: settings.appearance.theme.<id> */
  labelKey: string
  /** Swatch preview colors (hex).  `null` for the "system" pseudo-theme. */
  colors: { bg: string; fg: string; primary: string; accent: string } | null
  isDark: boolean
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
    id: 'obsidian',
    labelKey: 'settings.appearance.theme.obsidian',
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
]

export function getBuiltinTheme(id: string): ThemeDefinition | undefined {
  return BUILTIN_THEMES.find((t) => t.id === id)
}

/** Returns the resolved theme ID for "system": either "dark" or "light". */
export function resolveSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
