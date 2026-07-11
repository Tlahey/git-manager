/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
// Vitest's own config lives here too (not a separate vitest.config.ts) — Vitest requires a
// single resolved `vite`/plugin instance across config + tests, and a second config file
// pulling in its own `@vitejs/plugin-react` resolution triggered a duplicate-vite-version type
// conflict (two different `Plugin<any>` types) as soon as both existed side by side.
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Prevent vite from obscuring Rust errors
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Watch Tauri config & Rust source files
      ignored: ['**/src-tauri/**'],
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    alias: {
      // See src/test/monacoEditorStub.ts — the real package can't be resolved under Vitest.
      'monaco-editor': fileURLToPath(new URL('./src/test/monacoEditorStub.ts', import.meta.url)),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // No repo-wide thresholds here on purpose — this repo's legacy files aren't at 95% yet.
      // See .claude/skills/test-coverage-guardian, which enforces the 95% bar per-file, scoped
      // to files actually touched in a given change.
    },
  },
} as any))
