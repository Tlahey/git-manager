// Theme registry + validators are owned by @git-manager/theme (the single source
// of truth, shared with the CSS token blocks and the Storybook). This module
// re-exports them for app-local imports and adds the one DOM-bound helper that
// doesn't belong in a framework-free package.
export type { ThemeDefinition } from '@git-manager/theme'
export { BUILTIN_THEMES, getBuiltinTheme } from '@git-manager/theme'

/** Returns the resolved theme ID for "system": either "dark" or "light". */
export function resolveSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
