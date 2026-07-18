import { BUILTIN_THEMES } from '@git-manager/theme'

// The theme surfaces a component can actually sit on. "sidebar" opts into
// .chrome-surface so nested components remap exactly as they do in the app.
export const SURFACES = {
  background: 'bg-background text-foreground',
  card: 'bg-card text-card-foreground',
  popover: 'bg-popover text-popover-foreground',
  sidebar: 'chrome-surface bg-sidebar text-sidebar-foreground',
} as const

export type SurfaceId = keyof typeof SURFACES

/** Every real built-in theme id (skips the "system" pseudo-theme). */
export const DEFAULT_THEMES: string[] = BUILTIN_THEMES.filter((t) => t.id !== 'system').map(
  (t) => t.id,
)

export const DEFAULT_SURFACES = Object.keys(SURFACES) as SurfaceId[]
