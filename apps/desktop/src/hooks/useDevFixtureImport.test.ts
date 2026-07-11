import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDevFixtureImport } from './useDevFixtureImport'
import { useDevFixtureReposStore } from '../stores/devFixtureRepos.store'

beforeEach(() => {
  useDevFixtureReposStore.setState({ fixtures: [] })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('useDevFixtureImport', () => {
  it('does nothing when VITE_DEV_FIXTURES is unset', () => {
    vi.stubEnv('VITE_DEV_FIXTURES', '')
    renderHook(() => useDevFixtureImport())
    expect(useDevFixtureReposStore.getState().fixtures).toEqual([])
  })

  it('parses VITE_DEV_FIXTURES and injects the fixtures into the store', () => {
    const fixtures = [{ name: 'conflict', path: '/tmp/conflict', description: 'a rebase conflict' }]
    vi.stubEnv('VITE_DEV_FIXTURES', JSON.stringify(fixtures))
    renderHook(() => useDevFixtureImport())
    expect(useDevFixtureReposStore.getState().fixtures).toEqual(fixtures)
  })

  it('logs and does not throw when VITE_DEV_FIXTURES is malformed JSON', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('VITE_DEV_FIXTURES', '{not valid json')
    expect(() => renderHook(() => useDevFixtureImport())).not.toThrow()
    expect(errorSpy).toHaveBeenCalled()
    expect(useDevFixtureReposStore.getState().fixtures).toEqual([])
  })

  it('does nothing outside dev mode, even with fixtures set', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEV_FIXTURES', JSON.stringify([{ name: 'a', path: '/a', description: 'a' }]))
    renderHook(() => useDevFixtureImport())
    expect(useDevFixtureReposStore.getState().fixtures).toEqual([])
  })
})
