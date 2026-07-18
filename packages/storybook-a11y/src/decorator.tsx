import type { Decorator } from '@storybook/react'
import { DEFAULT_THEMES, SURFACES, type SurfaceId } from './constants'

// The shared Storybook "preview plugin": a theme + surface toolbar and the decorator
// that applies them. Each package's .storybook/preview re-exports `globalTypes` and
// adds `withThemeSurface` to its decorators (plus its own CSS import and any extras
// like <Toaster/>), so every Storybook in the repo drives themes identically and the
// a11y matrix (runA11yMatrix) can inject the same globals.

export const globalTypes = {
  theme: {
    description: 'App theme applied to the story canvas (sets html[data-theme])',
    defaultValue: 'twilight',
    toolbar: {
      title: 'Theme',
      icon: 'paintbrush',
      items: DEFAULT_THEMES,
      dynamicTitle: true,
    },
  },
  surface: {
    description: 'Theme surface the canvas is painted with',
    defaultValue: 'background',
    toolbar: {
      title: 'Surface',
      icon: 'photo',
      items: [
        { value: 'background', title: 'Background' },
        { value: 'card', title: 'Card' },
        { value: 'popover', title: 'Popover' },
        { value: 'sidebar', title: 'Sidebar / chrome' },
      ] satisfies { value: SurfaceId; title: string }[],
      dynamicTitle: true,
    },
  },
}

/**
 * Applies the selected theme to the document root (so hsl(var(--token)) resolves) and
 * paints the canvas with the selected surface. Theme/surface only — a consumer adds
 * its own CSS import and any global mounts (e.g. <Toaster/>) as separate decorators.
 */
export const withThemeSurface: Decorator = (Story, context) => {
  document.documentElement.dataset.theme = (context.globals.theme as string) ?? 'twilight'
  const surface = (context.globals.surface as SurfaceId) ?? 'background'
  return (
    <div className={`${SURFACES[surface] ?? SURFACES.background} min-h-screen`}>
      <Story />
    </div>
  )
}
