import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Repo-wide class contract: an animated element must state its timing with `animate-duration-*`,
 * never leave it to Tailwind's `duration-*`.
 *
 * `duration-*` sets `transition-duration`, and tailwindcss-animate additionally teaches it
 * `animation-duration`. That double meaning bites twice:
 *
 *  · Next to `animate-in`/`animate-out` on an element with no `transition-*`, it leaves
 *    `transition-property` at its CSS initial value — `all` — so every later property change
 *    becomes an animation. That is what made the shared Tooltip glide in from off-screen: the
 *    bubble is measured off-screen and positioned from JS a commit later.
 *  · Next to `animate-pulse`/`spin`/`bounce`/`ping`, it overrides the duration baked into those
 *    utilities' `animation` shorthand — even when the `duration-*` plainly belongs to a
 *    `transition-*` on the same element. The graph row's agent ring pulsed at its neighbouring
 *    `duration-150` instead of the default 2s, which reads as a flicker.
 *
 * The sweep is over whole `className` values, not lines: the graph-row case had the animation and
 * the duration on separate lines of one `cn(...)` call, which is exactly how it went unnoticed.
 */

const CORE_ANIMATION = /\banimate-(pulse|spin|bounce|ping)\b/
const PLUGIN_ANIMATION = /\banimate-(in|out)\b/
// `animate-duration-150` contains "duration-150"; only a standalone one is ambiguous.
const BARE_DURATION = /(?<!animate-)\bduration-\d+/
const EXPLICIT_DURATION = /\banimate-duration-\d+/

function repoRoot(): string {
  let dir = process.cwd()
  while (!exists(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir)
    if (parent === dir) throw new Error('pnpm-workspace.yaml not found above ' + process.cwd())
    dir = parent
  }
  return dir
}

function exists(path: string): boolean {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!exists(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) out.push(full)
  }
  return out
}

/** Every `className` value in a file, following balanced braces so a multi-line `cn(…)` stays one. */
function classNameValues(source: string): { line: number; value: string }[] {
  const values: { line: number; value: string }[] = []
  const attribute = /className\s*=\s*/g
  let match: RegExpExecArray | null

  while ((match = attribute.exec(source))) {
    let i = match.index + match[0].length
    const start = i
    const char = source[i]

    if (char === '"' || char === "'") {
      i++
      while (i < source.length && source[i] !== char) i++
      i++
    } else if (char === '{') {
      let depth = 0
      do {
        if (source[i] === '{') depth++
        else if (source[i] === '}') depth--
        i++
      } while (i < source.length && depth > 0)
    } else {
      continue
    }

    values.push({
      line: source.slice(0, start).split('\n').length,
      value: source.slice(start, i),
    })
  }
  return values
}

describe('animation timing classes', () => {
  const root = repoRoot()
  const files = [join(root, 'apps'), join(root, 'packages')].flatMap((dir) => sourceFiles(dir))

  it('scans the whole monorepo', () => {
    // Guards the guard: a broken path would make the assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(100)
  })

  it('never leaves an animated element timed by a bare duration-*', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const { line, value } of classNameValues(source)) {
        const animated = CORE_ANIMATION.test(value) || PLUGIN_ANIMATION.test(value)
        if (!animated) continue
        if (!BARE_DURATION.test(value)) continue
        if (EXPLICIT_DURATION.test(value)) continue
        offenders.push(`${relative(root, file)}:${line}`)
      }
    }

    expect(
      offenders,
      'An animated element must state its own animate-duration-*: duration-* also sets ' +
        'animation-duration, overriding the animation and leaving transition-property at ' +
        "its initial 'all'.\n" +
        offenders.join('\n')
    ).toEqual([])
  })
})
