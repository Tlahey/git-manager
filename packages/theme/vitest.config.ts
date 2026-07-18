import { defineConfig } from 'vitest/config'

// Pure token/contrast/registry logic — no DOM needed, and no @vitejs/plugin-react
// (esbuild handles the JSX transform for the few story helpers). See the same note
// in packages/ui/vitest.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    css: false,
  },
})
