import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins multiple class strings', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, '', 'b')).toBe('a b')
  })

  it('supports conditional object syntax', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active')
  })

  it('merges conflicting Tailwind utility classes, keeping the last one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('merges conflicting classes across array/string mixes, last wins', () => {
    expect(cn(['text-sm', 'text-red-500'], 'text-lg')).toBe('text-red-500 text-lg')
  })

  it('keeps non-conflicting classes side by side', () => {
    expect(cn('flex', 'items-center', 'p-2')).toBe('flex items-center p-2')
  })

  it('returns an empty string for no meaningful input', () => {
    expect(cn()).toBe('')
    expect(cn(false, undefined, null)).toBe('')
  })
})
