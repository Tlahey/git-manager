// Test-only stand-in for the real `monaco-editor` package. That package ships without a `main`/
// `exports` field usable outside a browser-conditions resolver (only `module`), so Vite/Vitest
// fail to resolve it at all when running under jsdom — even with `vi.mock('monaco-editor', ...)`,
// since resolution fails before the mock can intercept it. Aliased in via `test.alias` in
// vite.config.ts (test-only, doesn't affect the real dev/build resolution), so files that
// `import * as monaco from 'monaco-editor'` can be loaded under Vitest; individual test files
// still `vi.mock('monaco-editor', ...)` to assert on specific calls.
function noop() {
  return undefined
}
const handler: ProxyHandler<Record<string, unknown>> = {
  get: () => noop,
}

export const editor = new Proxy({}, handler)
export const languages = new Proxy({}, handler)
export const Uri = { parse: (value: string) => ({ toString: () => value }) }

export default { editor, languages, Uri }
