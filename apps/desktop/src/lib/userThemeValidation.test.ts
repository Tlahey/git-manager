import { describe, it, expect, vi } from 'vitest'
import type { UserTheme } from '@git-manager/git-types'
import { warnOnInvalidUserTheme } from './userThemeValidation'

function theme(css: string, id = 'my-theme', name = 'My Theme'): UserTheme {
  return { id, name, css }
}

describe('warnOnInvalidUserTheme', () => {
  it('does nothing for cosmetic CSS with no theme token block', () => {
    const warn = vi.fn()
    warnOnInvalidUserTheme(theme('.foo { color: red; }'), warn)
    expect(warn).not.toHaveBeenCalled()
  })

  it('does not warn for a complete, accessible theme', () => {
    const warn = vi.fn()
    // A neutral, high-contrast token set: dark text on light surfaces.
    const tokens = [
      '--background: 0 0% 100%',
      '--foreground: 0 0% 5%',
      '--card: 0 0% 100%',
      '--card-foreground: 0 0% 5%',
      '--popover: 0 0% 100%',
      '--popover-foreground: 0 0% 5%',
      '--primary: 0 0% 10%',
      '--primary-foreground: 0 0% 100%',
      '--secondary: 0 0% 92%',
      '--secondary-foreground: 0 0% 10%',
      '--muted: 0 0% 92%',
      '--muted-foreground: 0 0% 30%',
      '--accent: 0 0% 92%',
      '--accent-foreground: 0 0% 10%',
      '--destructive: 0 0% 20%',
      '--destructive-foreground: 0 0% 100%',
      '--success: 0 0% 20%',
      '--success-foreground: 0 0% 100%',
      '--border: 0 0% 85%',
      '--input: 0 0% 85%',
      '--ring: 0 0% 10%',
      '--radius: 0.5rem',
      '--sidebar-background: 0 0% 100%',
      '--sidebar-foreground: 0 0% 5%',
      '--sidebar-border: 0 0% 85%',
      '--sidebar-muted-foreground: 0 0% 30%',
      '--sidebar-accent: 0 0% 92%',
      '--sidebar-accent-foreground: 0 0% 10%',
    ].join('; ')
    warnOnInvalidUserTheme(theme(`html[data-theme="my-theme"] { ${tokens}; }`), warn)
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns when a theme block is incomplete or low-contrast', () => {
    const warn = vi.fn()
    warnOnInvalidUserTheme(
      theme('html[data-theme="my-theme"] { --background: 0 0% 100%; --foreground: 0 0% 96%; }'),
      warn,
    )
    expect(warn).toHaveBeenCalledOnce()
    const [, validation] = warn.mock.calls[0]
    expect(validation.missingTokens.length).toBeGreaterThan(0)
    expect(validation.contrastFailures.some((f: string) => f.startsWith('foreground/background'))).toBe(
      true,
    )
  })

  it('falls back to the first block when the id does not match the selector', () => {
    const warn = vi.fn()
    warnOnInvalidUserTheme(
      theme('html[data-theme="other-id"] { --background: 0 0% 100%; --foreground: 0 0% 96%; }'),
      warn,
    )
    expect(warn).toHaveBeenCalledOnce()
  })
})
