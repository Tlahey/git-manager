import { describe, it, expect } from 'vitest'

describe('element entry point', () => {
  it('registers the git-mascot custom element as an import side effect', async () => {
    await import('./element')
    expect(customElements.get('git-mascot')).toBeDefined()
  })

  it('re-exports the framework-agnostic pieces used by non-React consumers', async () => {
    const mod = await import('./element')
    expect(mod.GitMascotElement).toBeDefined()
    expect(mod.defineGitMascot).toBeTypeOf('function')
    expect(mod.MASCOT_MARKUP).toContain('<svg')
    expect(mod.MASCOT_STYLES).toContain('gm-wave')
    expect(mod.MASCOT_VIEWBOX).toBeDefined()
    expect(mod.MASCOT_SELECTORS.root).toBe('gm-svg')
  })
})
