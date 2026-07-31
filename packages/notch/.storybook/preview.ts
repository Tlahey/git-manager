import type { Preview } from '@storybook/react'
// Theme tokens (--foreground etc.) + tailwind layers come from the shared ui globals — the notch
// card paints its own fixed palette, but the @git-manager/ui primitives it composes (Button,
// Badge, Avatar) resolve their tokens from here.
import '@git-manager/ui/globals.css'

// The real popover window pins `data-theme="dark"` on <html> (see the desktop app's index.html)
// purely so those shared primitives resolve a theme. Storybook has to do the same, or every
// Button inside a story renders with unresolved custom properties.
document.documentElement.setAttribute('data-theme', 'dark')

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
  },
}

export default preview
