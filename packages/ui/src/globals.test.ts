import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// vitest runs with cwd = the package root (packages/ui).
const globalsCss = readFileSync(resolve(process.cwd(), 'src/globals.css'), 'utf8')

// The `.chrome-surface` utility opts a subtree (action toolbar, footer) into the
// dark nav-chrome palette on themes like Twilight. This is a CSS-contract test
// (jsdom doesn't apply real stylesheets, so inherited color can't be asserted via
// a render) guarding the two ways it went wrong for Twilight.
describe('.chrome-surface (globals.css)', () => {
  const block = globalsCss.match(/\.chrome-surface\s*\{([^}]*)\}/)?.[1] ?? ''

  it('exists as a single flat rule', () => {
    expect(block, '.chrome-surface rule not found in globals.css').not.toBe('')
  })

  it('re-anchors the text color to the chrome foreground', () => {
    // Regression: remapping only the --foreground variable left children that set
    // no explicit text color inheriting the dark content color from <body>, so the
    // toolbar repo/branch labels rendered near-black on the dark chrome.
    expect(block).toMatch(/color:\s*hsl\(var\(--sidebar-foreground\)\)/)
  })

  it('remaps the neutral surface tokens to their sidebar equivalents', () => {
    expect(block).toMatch(/--background:\s*var\(--sidebar-background\)/)
    expect(block).toMatch(/--foreground:\s*var\(--sidebar-foreground\)/)
    expect(block).toMatch(/--border:\s*var\(--sidebar-border\)/)
  })

  it('re-points the component tokens to the chrome accent (surface-scoped override)', () => {
    // The "if the surface is chrome, use this colour" example: buttons/badges follow
    // the surface onto the dark nav via the already-graded sidebar-accent pair.
    expect(block).toMatch(/--button-bg:\s*var\(--sidebar-accent\)/)
    expect(block).toMatch(/--button-foreground:\s*var\(--sidebar-accent-foreground\)/)
    expect(block).toMatch(/--badge-bg:\s*var\(--sidebar-accent\)/)
    expect(block).toMatch(/--badge-foreground:\s*var\(--sidebar-accent-foreground\)/)
  })
})
