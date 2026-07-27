import { describe, it, expect } from 'vitest'
import type { ModelContextLimits } from '../../../lib/tauri'
import { contextWindowVerdict, isHarmfulVerdict } from './aiContextWindowVerdict'

function limits(partial: Partial<ModelContextLimits>): ModelContextLimits {
  return {
    architectureMax: null,
    modelfileNumCtx: null,
    allocatedContext: null,
    ...partial,
  }
}

describe('contextWindowVerdict', () => {
  it('calls a value above the model’s ceiling wrong, whatever the server allocated', () => {
    // The ceiling outranks the allocated window on purpose: this one stays wrong after a reload
    // with a different OLLAMA_CONTEXT_LENGTH, so it is the more useful thing to report.
    expect(contextWindowVerdict(131072, limits({ architectureMax: 8192 }))).toBe('above-ceiling')
    expect(
      contextWindowVerdict(131072, limits({ architectureMax: 8192, allocatedContext: 8192 }))
    ).toBe('above-ceiling')
  })

  it('can only say "plausible" while the model is not loaded', () => {
    // /api/show alone cannot see a server-side OLLAMA_CONTEXT_LENGTH — passing it is not proof.
    expect(contextWindowVerdict(4096, limits({ architectureMax: 32768 }))).toBe('plausible')
    expect(contextWindowVerdict(4096, limits({ architectureMax: 32768, modelfileNumCtx: 8192 }))).toBe(
      'plausible'
    )
  })

  it('catches a declared window the server will not actually serve', () => {
    // The failure the setting exists to prevent, and the one that was undetectable before /api/ps:
    // the model supports 32k, the user declared 32k, the server allocated 4k.
    expect(
      contextWindowVerdict(32768, limits({ architectureMax: 131072, allocatedContext: 4096 }))
    ).toBe('above-allocated')
  })

  it('reports a window the server would happily serve more of', () => {
    expect(
      contextWindowVerdict(4096, limits({ architectureMax: 131072, allocatedContext: 40960 }))
    ).toBe('below-allocated')
  })

  it('verifies a value that matches what the server allocated', () => {
    expect(contextWindowVerdict(40960, limits({ allocatedContext: 40960 }))).toBe(
      'matches-allocated'
    )
  })

  it('ignores a Modelfile num_ctx as a verdict — the running server overrides it', () => {
    // Exactly the disagreement /api/ps exists to expose: the Modelfile pins 4096, the server
    // allocated 40960, and the declared value is right.
    expect(
      contextWindowVerdict(40960, limits({ modelfileNumCtx: 4096, allocatedContext: 40960 }))
    ).toBe('matches-allocated')
  })
})

describe('isHarmfulVerdict', () => {
  it('flags only the two verdicts that lose the instruction', () => {
    expect(isHarmfulVerdict('above-ceiling')).toBe(true)
    expect(isHarmfulVerdict('above-allocated')).toBe(true)
    expect(isHarmfulVerdict('below-allocated')).toBe(false)
    expect(isHarmfulVerdict('matches-allocated')).toBe(false)
    expect(isHarmfulVerdict('plausible')).toBe(false)
  })
})
