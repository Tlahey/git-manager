import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settings.store'
import { resolveSystemTheme } from '../lib/themes'
import { registerMonacoThemes } from '../lib/monacoThemes'

// Map of application theme IDs to Monaco theme IDs
const THEME_MAP: Record<string, string> = {
  'system': 'git-manager-dark', // Will be resolved to dark or light
  'dark': 'git-manager-dark',
  'light': 'git-manager-light',
  'github-light': 'git-manager-github-light',
  'github-dark': 'git-manager-github-dark',
  'nord': 'git-manager-nord',
  'dracula': 'git-manager-dracula',
  'catppuccin-mocha': 'git-manager-catppuccin-mocha',
  'solarized-light': 'git-manager-solarized-light',
}

export function useMonacoTheme() {
  const theme = useSettingsStore((s) => s.settings.appearance.theme)

  useEffect(() => {
    // Register all themes on mount
    registerMonacoThemes()

    // Function to apply Monaco theme
    function applyMonacoTheme(themeId: string) {
      const resolved = themeId === 'system' ? resolveSystemTheme() : themeId
      const monacoThemeName = THEME_MAP[resolved] || 'git-manager-dark'

      // Apply the theme to Monaco editor
      if (typeof window !== 'undefined' && (window as any).monaco) {
        (window as any).monaco.editor.setTheme(monacoThemeName)
      }
    }

    applyMonacoTheme(theme)
  }, [theme])
}