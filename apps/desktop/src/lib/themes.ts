// ─── Theme definitions ────────────────────────────────────────────────────────
//
// `colors` holds hex values used to render the swatch previews in the Settings
// theme picker.  They intentionally replicate the CSS variable values above so
// the preview is accurate without having to parse the live CSS.

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
    colors: { bg: '#0f172a', fg: '#f8fafc', primary: '#3b82f6', accent: '#1e3a5f' },
    isDark: true,
  },
  {
    id: 'light',
    labelKey: 'settings.appearance.theme.light',
    colors: { bg: '#ffffff', fg: '#0f172a', primary: '#3b82f6', accent: '#dbeafe' },
    isDark: false,
  },
  {
    id: 'github-light',
    labelKey: 'settings.appearance.theme.github-light',
    colors: { bg: '#ffffff', fg: '#1f2328', primary: '#0969da', accent: '#f6f8fa' },
    isDark: false,
  },
  {
    id: 'github-dark',
    labelKey: 'settings.appearance.theme.github-dark',
    colors: { bg: '#0d1117', fg: '#e6edf3', primary: '#2f81f7', accent: '#161b22' },
    isDark: true,
  },
  {
    id: 'nord',
    labelKey: 'settings.appearance.theme.nord',
    colors: { bg: '#2e3440', fg: '#eceff4', primary: '#88c0d0', accent: '#81a1c1' },
    isDark: true,
  },
  {
    id: 'dracula',
    labelKey: 'settings.appearance.theme.dracula',
    colors: { bg: '#282a36', fg: '#f8f8f2', primary: '#bd93f9', accent: '#44475a' },
    isDark: true,
  },
  {
    id: 'catppuccin-mocha',
    labelKey: 'settings.appearance.theme.catppuccin-mocha',
    colors: { bg: '#1e1e2e', fg: '#cdd6f4', primary: '#cba6f7', accent: '#313244' },
    isDark: true,
  },
  {
    id: 'solarized-light',
    labelKey: 'settings.appearance.theme.solarized-light',
    colors: { bg: '#fdf6e3', fg: '#073642', primary: '#268bd2', accent: '#eee8d5' },
    isDark: false,
  },
  {
    id: 'amethyst',
    labelKey: 'settings.appearance.theme.amethyst',
    colors: { bg: '#180b24', fg: '#f3e8ff', primary: '#c084fc', accent: '#3b1d54' },
    isDark: true,
  },
  {
    id: 'forest',
    labelKey: 'settings.appearance.theme.forest',
    colors: { bg: '#0a1c12', fg: '#e6f4ea', primary: '#34a853', accent: '#133821' },
    isDark: true,
  },
  {
    id: 'cyberpunk',
    labelKey: 'settings.appearance.theme.cyberpunk',
    colors: { bg: '#120216', fg: '#d9fffb', primary: '#ff007f', accent: '#ffff00' },
    isDark: true,
  },
  {
    id: 'platinum',
    labelKey: 'settings.appearance.theme.platinum',
    colors: { bg: '#0e121a', fg: '#f1f5f9', primary: '#67e8f9', accent: '#f472b6' },
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
