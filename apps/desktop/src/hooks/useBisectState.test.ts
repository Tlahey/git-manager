import { describe, it, expect } from 'vitest'
import { bisectStateKey } from './useBisectState'

describe('bisectStateKey', () => {
  it('returns null when no repo path is given', () => {
    expect(bisectStateKey(null)).toBeNull()
  })

  it('builds a stable SWR key from the repo path', () => {
    expect(bisectStateKey('/repo')).toEqual(['bisect-state', '/repo'])
  })
})
