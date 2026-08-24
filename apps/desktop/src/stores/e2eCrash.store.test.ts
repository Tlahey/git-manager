import { describe, it, expect, beforeEach } from 'vitest'
import { useE2eCrashStore } from './e2eCrash.store'

beforeEach(() => {
  useE2eCrashStore.setState({ shouldCrash: false })
})

describe('e2eCrash store', () => {
  it('starts with shouldCrash false', () => {
    expect(useE2eCrashStore.getState().shouldCrash).toBe(false)
  })

  it('trigger flips shouldCrash to true', () => {
    useE2eCrashStore.getState().trigger()
    expect(useE2eCrashStore.getState().shouldCrash).toBe(true)
  })
})
