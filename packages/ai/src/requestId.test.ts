import { describe, expect, it, vi } from 'vitest'
import { newAiRequestId } from './requestId'

describe('newAiRequestId', () => {
  it('never returns the same id twice', () => {
    const ids = new Set(Array.from({ length: 1000 }, newAiRequestId))
    expect(ids.size).toBe(1000)
  })

  it('stays unique without randomUUID', () => {
    // The fallback is the path that matters for correctness across windows: the backend's
    // generation registry is shared by every window, so ids minted in different windows land in the
    // same namespace.
    vi.stubGlobal('crypto', {})
    const ids = new Set(Array.from({ length: 1000 }, newAiRequestId))
    expect(ids.size).toBe(1000)
  })

  it('survives an environment with no crypto at all', () => {
    vi.stubGlobal('crypto', undefined)
    expect(() => newAiRequestId()).not.toThrow()
    expect(newAiRequestId()).toMatch(/^ai-/)
  })

  it('prefixes every id, so a stray value is recognisable in a log', () => {
    expect(newAiRequestId()).toMatch(/^ai-/)
  })
})
