import { describe, it, expect } from 'vitest'
import { badgeVariantForAction, railVariantForAction } from './rebaseActionStyles'

// Shared by the interactive-rebase editor (the plan being composed) and the rebase progress view
// (the plan being executed) — one mapping so a command reads the same in both.
describe('badgeVariantForAction', () => {
  it('maps the interactive-rebase actions to their editor colors', () => {
    expect(badgeVariantForAction('pick')).toBe('secondary')
    expect(badgeVariantForAction('reword')).toBe('warning')
    expect(badgeVariantForAction('squash')).toBe('success')
    expect(badgeVariantForAction('drop')).toBe('destructive')
  })

  it('falls back to outline for commands the editor never writes', () => {
    expect(badgeVariantForAction('exec')).toBe('outline')
    expect(badgeVariantForAction('update-ref')).toBe('outline')
  })
})

describe('railVariantForAction', () => {
  it('folds squash and fixup into the row above', () => {
    expect(railVariantForAction('squash')).toBe('combined')
    expect(railVariantForAction('fixup')).toBe('combined')
  })

  it('strikes a drop through and leaves everything else normal', () => {
    expect(railVariantForAction('drop')).toBe('dropped')
    expect(railVariantForAction('pick')).toBe('normal')
    expect(railVariantForAction('exec')).toBe('normal')
  })
})
