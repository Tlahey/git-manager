import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AppConfigLoad } from '../tauri'

const readConfig = vi.fn<() => Promise<AppConfigLoad>>()
const writeSection = vi.fn<(section: string, version: number, value: unknown) => Promise<void>>()

vi.mock('../../api/config.api', () => ({
  apiReadAppConfig: () => readConfig(),
  apiWriteAppConfigSection: (section: string, version: number, value: unknown) =>
    writeSection(section, version, value),
}))

import {
  flushConfigWrites,
  isConfigDisabled,
  loadAppConfig,
  readConfigSection,
  resetAppConfigForTests,
  writeConfigSection,
} from './appConfigFile'

const file = (sections: Record<string, unknown>) => JSON.stringify(sections)

beforeEach(() => {
  readConfig.mockReset().mockResolvedValue({ disabled: false, contents: null })
  writeSection.mockReset().mockResolvedValue(undefined)
  localStorage.clear()
  resetAppConfigForTests()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  resetAppConfigForTests()
})

describe('loadAppConfig — reading', () => {
  it('exposes each section of the file with the version it was written at', async () => {
    readConfig.mockResolvedValue({
      disabled: false,
      contents: file({
        settings: { language: 'en' },
        workspace: { openTabs: ['/a'], activeRepo: '/a', activeTab: '/a' },
        versions: { settings: 1 },
      }),
    })
    await loadAppConfig()

    expect(readConfigSection('settings')).toEqual({ state: { language: 'en' }, version: 1 })
    expect(readConfigSection('workspace')?.state).toEqual({
      openTabs: ['/a'],
      activeRepo: '/a',
      activeTab: '/a',
    })
    expect(readConfigSection('dashboard')).toBeNull()
  })

  it('reads the file once however many callers ask for it', async () => {
    await Promise.all([loadAppConfig(), loadAppConfig()])
    await loadAppConfig()
    expect(readConfig).toHaveBeenCalledTimes(1)
  })

  it('starts from defaults rather than failing when the file will not parse', async () => {
    readConfig.mockResolvedValue({ disabled: false, contents: '{ not json' })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(loadAppConfig()).resolves.toBeUndefined()
    expect(readConfigSection('settings')).toBeNull()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('drops only the section that fails validation', async () => {
    readConfig.mockResolvedValue({
      disabled: false,
      contents: file({
        workspace: { openTabs: 'not-an-array' },
        dashboard: { collapsedSections: {}, hiddenSections: {}, sectionColors: {} },
      }),
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await loadAppConfig()

    expect(readConfigSection('workspace')).toBeNull()
    expect(readConfigSection('dashboard')).not.toBeNull()
    expect(consoleWarn).toHaveBeenCalled()
    consoleWarn.mockRestore()
  })
})

describe('loadAppConfig — carrying over the localStorage era', () => {
  it('adopts a section a previous version persisted, and writes it into the file once', async () => {
    localStorage.setItem(
      'git-manager-repos-ui',
      JSON.stringify({ state: { openTabs: ['/a'], activeRepo: '/a', activeTab: '/a' }, version: 0 })
    )
    await loadAppConfig()

    expect(readConfigSection('workspace')?.state).toEqual({
      openTabs: ['/a'],
      activeRepo: '/a',
      activeTab: '/a',
    })
    expect(writeSection).toHaveBeenCalledWith('workspace', 0, {
      openTabs: ['/a'],
      activeRepo: '/a',
      activeTab: '/a',
    })
  })

  it('unwraps the settings snapshot, which used to carry its own `settings` key', async () => {
    // The one section whose shape changed with the move: `{ settings: … }` in localStorage, the
    // settings themselves in the file. Adopting it verbatim would bury them one level deep and
    // hand the store an object with no groups it recognises — a silent reset to factory defaults.
    localStorage.setItem(
      'git-manager-settings',
      JSON.stringify({ state: { settings: { language: 'en' } }, version: 1 })
    )
    await loadAppConfig()

    expect(readConfigSection('settings')).toEqual({ state: { language: 'en' }, version: 1 })
  })

  it('ignores the legacy key once the section exists — the file is the source of truth', async () => {
    localStorage.setItem(
      'git-manager-settings',
      JSON.stringify({ state: { settings: { language: 'en' } }, version: 1 })
    )
    readConfig.mockResolvedValue({
      disabled: false,
      contents: file({ settings: { language: 'fr' } }),
    })
    await loadAppConfig()

    expect(readConfigSection('settings')?.state).toEqual({ language: 'fr' })
    expect(writeSection).not.toHaveBeenCalled()
  })
})

describe('the configuration file switched off', () => {
  it('reads nothing, writes nothing, and reports itself disabled', async () => {
    readConfig.mockResolvedValue({ disabled: true, contents: null })
    localStorage.setItem('git-manager-settings', JSON.stringify({ state: { settings: {} } }))
    await loadAppConfig()

    expect(isConfigDisabled()).toBe(true)
    writeConfigSection('settings', 1, { language: 'en' })
    await flushConfigWrites()
    expect(writeSection).not.toHaveBeenCalled()
  })

  it('reports itself disabled before the load has answered', async () => {
    // What lets a store persist normally before `main.tsx`'s gate has run — and what makes every
    // store's own test suite go on asserting against localStorage.
    expect(isConfigDisabled()).toBe(true)
    await loadAppConfig()
    expect(isConfigDisabled()).toBe(false)
  })
})

describe('writing sections', () => {
  beforeEach(async () => {
    await loadAppConfig()
  })

  it('saves the first change of a burst straight away', () => {
    // A toggle or a theme pick is a single write and must not sit in a debounce window.
    writeConfigSection('settings', 1, { language: 'en' })
    expect(writeSection).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst into one trailing write carrying the last value', async () => {
    writeConfigSection('settings', 1, { language: 'a' })
    writeConfigSection('settings', 1, { language: 'ab' })
    writeConfigSection('settings', 1, { language: 'abc' })
    expect(writeSection).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(300)
    expect(writeSection).toHaveBeenCalledTimes(2)
    expect(writeSection.mock.calls[1][2]).toEqual({ language: 'abc' })
  })

  it('debounces each section on its own', async () => {
    // Two stores changing at once must not make one wait on the other's timer.
    writeConfigSection('settings', 1, { language: 'en' })
    writeConfigSection('workspace', 0, { openTabs: [], activeRepo: null, activeTab: 'dashboard' })
    expect(writeSection).toHaveBeenCalledTimes(2)
  })

  it('flushes a pending write on demand instead of waiting out the debounce', async () => {
    writeConfigSection('settings', 1, { language: 'en' })
    writeConfigSection('settings', 1, { language: 'fr' })

    await flushConfigWrites()
    expect(writeSection).toHaveBeenCalledTimes(2)
    expect(writeSection.mock.calls[1][2]).toEqual({ language: 'fr' })
  })

  it('makes a write readable immediately, without waiting for the disk', () => {
    writeConfigSection('settings', 1, { language: 'en' })
    expect(readConfigSection('settings')).toEqual({ state: { language: 'en' }, version: 1 })
  })

  it('removes a section when its store clears its storage', async () => {
    writeConfigSection('settings', 1, { language: 'en' })
    writeConfigSection('settings', 0, null)
    await flushConfigWrites()

    expect(readConfigSection('settings')).toBeNull()
    expect(writeSection).toHaveBeenLastCalledWith('settings', 0, null)
  })

  it('reports a failed save without letting it escape into the caller', async () => {
    // `persist` calls setItem from inside a state update; a rejection there would surface as an
    // unhandled promise rejection rather than as anything the user or the log can act on.
    writeSection.mockRejectedValue(new Error('read-only volume'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    writeConfigSection('settings', 1, { language: 'en' })
    await flushConfigWrites()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
