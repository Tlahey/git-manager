import { describe, expect, it } from 'vitest'
import { DEFAULT_SYSTEM_PROMPT, resolveSystemPrompt } from './prompts'

describe('resolveSystemPrompt', () => {
  it('returns the default when no custom prompt is given', () => {
    expect(resolveSystemPrompt()).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('returns the default for an empty string (the reset-to-default state)', () => {
    expect(resolveSystemPrompt('')).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('returns the default for a whitespace-only string', () => {
    expect(resolveSystemPrompt('   \n\t ')).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('returns the custom prompt verbatim (preserving surrounding whitespace) when non-blank', () => {
    expect(resolveSystemPrompt('  be terse  ')).toBe('  be terse  ')
  })
})
