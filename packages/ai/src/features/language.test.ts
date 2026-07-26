import { describe, expect, it } from 'vitest'
import { languageName } from './language'

describe('languageName', () => {
  it('maps the shipped locales to the words a prompt can use', () => {
    expect(languageName('fr')).toBe('French')
    expect(languageName('en')).toBe('English')
  })

  it('falls back to English for an absent or unsupported tag', () => {
    expect(languageName(undefined)).toBe('English')
    // A locale the app does not ship: answering in English beats asking the model for a language
    // nobody validated the prompts against.
    expect(languageName('pt-BR')).toBe('English')
  })
})
