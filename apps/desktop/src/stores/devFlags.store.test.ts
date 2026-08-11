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
  // Vitest runs with DEV true and no VITE_MOCK_GITHUB, which is exactly a developer's `pnpm dev`.
  // The fixtures used to default on there, so anyone running the app without a GitHub account got
  // a Launchpad full of invented pull requests under a single "showing demo data" line. Arming
  // them is now an explicit act — the env variable, or the footer's debug toggle.
  it('defaults mock GitHub data to off, even while developing', () => {
    expect(DEV_FLAG_DEFAULTS.mockGitHub).toBe(false)
  })

  it('flips for the rest of the session', () => {
    useDevFlagsStore.getState().setMockGitHub(false)
    expect(useDevFlagsStore.getState().mockGitHub).toBe(false)
  })

  // Same contract as mock GitHub data, for a sharper reason: this flag hands out the achievement
  // rewards. A build that didn't ask for it must ship the gate intact.
  it('defaults theme unlocking to off, even while developing', () => {
    expect(DEV_FLAG_DEFAULTS.unlockThemes).toBe(false)
  })

  it('flips theme unlocking for the rest of the session', () => {
    useDevFlagsStore.getState().setUnlockThemes(true)
    expect(useDevFlagsStore.getState().unlockThemes).toBe(true)
    useDevFlagsStore.getState().setUnlockThemes(false)
    expect(useDevFlagsStore.getState().unlockThemes).toBe(false)
  })

  it('is not persisted — a flag that survived a restart would be a setting', () => {
    expect('persist' in useDevFlagsStore).toBe(false)
  })
})
