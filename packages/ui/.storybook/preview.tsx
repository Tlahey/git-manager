import type { Preview, Decorator } from '@storybook/react'
// The app's actual stylesheet: pulls in @git-manager/theme's token blocks and the
// Tailwind layers (+ chrome-surface), so components render with real classes.
import '../src/globals.css'
// Theme/surface toolbar + decorator are shared across every Storybook in the repo.
import { globalTypes, withThemeSurface } from '@git-manager/storybook-a11y'
import { enableApcaInA11yAddon } from '@git-manager/storybook-a11y/preview-apca'
import { Toaster } from '../src/components/toast'

// Surface APCA Bronze in the addon-a11y Accessibility panel — both while browsing
// Storybook AND inside the storybookTest vitest run (alongside the WCAG 2.x rules).
// So `test:storybook` enforces contrast end-to-end (WCAG + APCA) and fails until
// every theme passes; the theme × surface matrix (`test:apca`) stays the comparison
// report across all themes/surfaces.
enableApcaInA11yAddon()

export { globalTypes }

// Mount <Toaster/> once so the Toast stories work — a ui-local concern, layered under
// the shared theme/surface wrapper.
const withToaster: Decorator = (Story) => (
  <>
    <Story />
    <Toaster />
  </>
)

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
    // Run axe on every story during the Vitest "storybook" project and FAIL on
    // violations ('error'). Set to 'todo' to report without failing while triaging.
    a11y: { test: 'error' },
  },
  decorators: [withThemeSurface, withToaster],
}

export default preview
