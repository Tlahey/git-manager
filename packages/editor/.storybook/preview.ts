// Polyfill require.toUrl for Monaco Editor ESM worker fallback
if (typeof (globalThis as any).require === 'undefined') {
  ;(globalThis as any).require = {
    toUrl: (id: string) => id,
  }
}

import type { Preview } from '@storybook/react'
import type { Environment } from 'monaco-editor'
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
// `monaco-editor/editor/…`, NOT the `monaco-editor/esm/vs/editor/…` path every Monaco guide still
// shows: since 0.5x the package ships an `exports` map whose `"./*"` entry already prepends
// `esm/vs/`, so the documented path resolves to `esm/vs/esm/vs/…` and fails. It failed silently for
// a while — the Storybook build emits the CSS before the JS bundle dies, so the only symptom was a
// non-zero exit nobody was watching.
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
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
