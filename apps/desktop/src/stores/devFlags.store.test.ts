import { describe, it, expect, beforeEach } from 'vitest'
import { DEV_FLAG_DEFAULTS, envFlag, useDevFlagsStore } from './devFlags.store'

beforeEach(() => {
  useDevFlagsStore.setState(DEV_FLAG_DEFAULTS)
})

describe('envFlag', () => {
  it('reads the truthy spellings a shell is likely to produce', () => {
    expect(envFlag('true')).toBe(true)
    expect(envFlag('1')).toBe(true)
  })

  it('reads the falsy ones', () => {
    expect(envFlag('false')).toBe(false)
    expect(envFlag('0')).toBe(false)
  })

  it('reports "unset" distinctly from "set to false"', () => {
    // The distinction is load-bearing: "the developer said no" and "the developer said nothing"
    // want different defaults.
    expect(envFlag(undefined)).toBeUndefined()
    expect(envFlag('')).toBeUndefined()
    expect(envFlag('yes')).toBeUndefined()
  })
})

describe('useDevFlagsStore', () => {
  it('defaults mock GitHub data to on while developing', () => {
    // Vitest runs with DEV true, and the fixtures are what make the Launchpad workable without a
    // token — that part of the old behaviour is worth keeping.
    expect(DEV_FLAG_DEFAULTS.mockGitHub).toBe(true)
  })

  it('flips for the rest of the session', () => {
    useDevFlagsStore.getState().setMockGitHub(false)
    expect(useDevFlagsStore.getState().mockGitHub).toBe(false)
  })

  it('is not persisted — a flag that survived a restart would be a setting', () => {
    expect('persist' in useDevFlagsStore).toBe(false)
  })
})
