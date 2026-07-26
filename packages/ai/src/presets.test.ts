import { describe, it, expect } from 'vitest'
import { AI_PRESETS, getAiPreset, migrateAiPresetId } from './presets'

describe('AI_PRESETS', () => {
  it('ships exactly the two supported entries', () => {
    expect(AI_PRESETS.map((p) => p.id)).toEqual(['ollama', 'openai-compatible'])
  })

  it('offers an API key only on the generic entry', () => {
    expect(getAiPreset('ollama').supportsApiKey).toBe(false)
    expect(getAiPreset('openai-compatible').supportsApiKey).toBe(true)
  })

  it('spells out the /v1 API base on the generic entry, and leaves Ollama its canonical origin', () => {
    // The backend appends /v1 to a bare origin, so both work — but the generic preset's default is
    // the place to teach that the field is the API *base*.
    expect(getAiPreset('openai-compatible').defaultUrl).toBe('http://localhost:1234/v1')
    expect(getAiPreset('ollama').defaultUrl).toBe('http://localhost:11434')
  })

  it('resolves both presets to the openai-compatible protocol', () => {
    expect(AI_PRESETS.every((p) => p.protocol === 'openai-compatible')).toBe(true)
  })

  it('throws on an unknown id rather than silently defaulting', () => {
    expect(() => getAiPreset('nope' as never)).toThrow()
  })
})

describe('migrateAiPresetId', () => {
  it('keeps a currently-known id', () => {
    expect(migrateAiPresetId('ollama')).toBe('ollama')
    expect(migrateAiPresetId('openai-compatible')).toBe('openai-compatible')
  })

  it.each(['lmstudio', 'openai', 'mlx', 'anthropic'])(
    'folds the removed %s preset into openai-compatible',
    (legacy) => {
      expect(migrateAiPresetId(legacy)).toBe('openai-compatible')
    }
  )

  it('falls back to openai-compatible for an unrecognized id', () => {
    expect(migrateAiPresetId('some-hand-edited-value')).toBe('openai-compatible')
  })
})
