import type { Preview, Decorator } from '@storybook/react'
import '../src/themes.css'
import { BUILTIN_THEMES } from '../src/registry'

// Toolbar entries: every real theme (skip the "system" pseudo-theme, which has no
// token block of its own).
const themeIds = BUILTIN_THEMES.filter((t) => t.id !== 'system').map((t) => t.id)

export const globalTypes = {
  theme: {
    description: 'App theme applied to the story canvas (sets html[data-theme])',
    defaultValue: 'twilight',
    toolbar: {
      title: 'Theme',
      icon: 'paintbrush',
      items: themeIds,
      dynamicTitle: true,
    },
  },
}

// Applies the selected theme to the document root so any story using the token
// CSS variables (via hsl(var(--token))) renders in that theme.
const withTheme: Decorator = (Story, context) => {
  document.documentElement.dataset.theme = (context.globals.theme as string) ?? 'twilight'
  return <Story />
}

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
  },
  decorators: [withTheme],
}

export default preview
