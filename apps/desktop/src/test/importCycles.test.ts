import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'

/**
 * No import cycle may pass through a module that evaluates at *import* time.
 *
 * A cycle among components is harmless: they run on render, long after the module graph has settled.
 * A cycle through a Zustand store is not — a store builds its initial state inside the `create(…)`
 * call, while the graph is still being evaluated — and neither is one through `lib/appConfig/`,
 * which reads section defaults the same way. What comes out is a blank window and
 * `Cannot access 'X' before initialization`, from a stack that names none of the files involved.
 *
 * This exists because a **barrel** makes that mistake easy and invisible. A feature's `index.ts`
 * re-exports the whole view, so a store reaching one of its constants through the barrel takes a
 * dependency on every component behind it — including the ones that read that store. That is exactly
 * what happened when `stores/gitGraphColumns.store.ts` imported `COLUMN_ORDER` from
 * `features/graph`, and the fix (import the `lib/` module at its own path) is one "tidy the imports"
 * commit away from being undone. Hence a test rather than a comment.
 *
 * `export … from` counts: it is how a barrel depends on what it re-exports, and skipping it is what
 * made a first version of this check pass against the broken tree. Type-only forms don't: they are
 * erased before any of this exists.
 */

const SRC = join(import.meta.dirname, '..')
const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

/** `import …`/`export … from '…'`, minus the type-only forms, across a multi-line clause. */
const STATEMENT =
  /^(?:import|export)\s+(?!type[\s{])(?:[^'"\n]|\n(?!\s*(?:import|export)\s))*?from\s+['"](\.[^'"]+)['"]/gm

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    const isSource = /\.tsx?$/.test(entry) && !entry.includes('.test.')
    return isSource ? [path] : []
  })
}

/** Resolves a relative specifier the way the bundler does, or `null` for a package import. */
function resolveImport(specifier: string, importer: string): string | null {
  const base = normalize(join(dirname(importer), specifier))
  for (const extension of EXTENSIONS) {
    try {
      if (statSync(base + extension).isFile()) return normalize(base + extension)
    } catch {
      /* not this extension */
    }
  }
  return null
}

/** True for a module whose body runs work at import time — a store, or the config it hydrates. */
function evaluatesAtImportTime(path: string): boolean {
  return path.includes('stores/') || path.startsWith('lib/appConfig/')
}

function findRiskyCycles(): string[][] {
  const files = sourceFiles(SRC).map((f) => relative(SRC, f))
  const graph = new Map<string, string[]>(
    files.map((file) => {
      const source = readFileSync(join(SRC, file), 'utf8')
      const deps = [...source.matchAll(STATEMENT)]
        .map((match) => resolveImport(match[1], join(SRC, file)))
        .filter((path): path is string => path !== null)
        .map((path) => relative(SRC, path))
      return [file, deps]
    })
  )

  const cycles: string[][] = []
  const seen = new Set<string>()
  const state = new Map<string, 1 | 2>()
  const stack: string[] = []

  function walk(file: string) {
    state.set(file, 1)
    stack.push(file)
    for (const dep of graph.get(file) ?? []) {
      if (state.get(dep) === 1) {
        const cycle = stack.slice(stack.indexOf(dep))
        const key = [...cycle].sort().join('|')
        if (!seen.has(key) && cycle.some(evaluatesAtImportTime)) {
          seen.add(key)
          cycles.push([...cycle, dep])
        }
      } else if (!state.has(dep)) {
        walk(dep)
      }
    }
    stack.pop()
    state.set(file, 2)
  }

  for (const file of files) if (!state.has(file)) walk(file)
  return cycles
}

describe('module graph', () => {
  it('has no import cycle through a store or the app configuration', () => {
    const cycles = findRiskyCycles().map((cycle) => cycle.join(' → '))
    expect(cycles).toEqual([])
  })
})
