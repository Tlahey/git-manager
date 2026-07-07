import type { Preview } from '@storybook/react'
import type { Environment } from 'monaco-editor'
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
// Theme tokens (--foreground etc.) + tailwind layers come from the shared ui globals; the
// merge-specific classes ship with this package.
import '@git-manager/ui/globals.css'
import '../src/styles.css'

// Bundle monaco locally instead of letting @monaco-editor/react's loader fetch it from a CDN —
// keeps stories (and the Playwright e2e suite that runs against them) deterministic and
// offline-friendly. The plain editor worker is enough: stories use plaintext/simple languages,
// no language services needed.
;(globalThis as { MonacoEnvironment?: Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}
loader.config({ monaco })

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
  },
}

export default preview
