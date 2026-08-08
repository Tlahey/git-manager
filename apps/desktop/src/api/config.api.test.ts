import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({ readAppConfig: vi.fn(), writeAppConfigSection: vi.fn() }))

import * as tauri from '../lib/tauri'
import * as api from './config.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('config.api', () => {
  it('apiReadAppConfig returns the file contents verbatim', async () => {
    mocked.readAppConfig.mockResolvedValue({ disabled: false, contents: '{"settings":{}}' })
    expect(await api.apiReadAppConfig()).toEqual({ disabled: false, contents: '{"settings":{}}' })
  })

  it('apiReadAppConfig passes the disabled flag through', async () => {
    // GIT_MANAGER_NO_CONFIG: the caller has to know, because it decides where the stores persist.
    mocked.readAppConfig.mockResolvedValue({ disabled: true, contents: null })
    expect(await api.apiReadAppConfig()).toEqual({ disabled: true, contents: null })
  })

  // An unreadable configuration must not be able to stop the app from starting: the caller has
  // defaults for every section, and this is the boundary where "could not read" becomes "nothing
  // to read". Reporting `disabled: false` is deliberate — a failed read is not a switched-off file,
  // and answering otherwise would silently move every store to localStorage.
  it('apiReadAppConfig falls back to an empty, enabled configuration when the read fails', async () => {
    mocked.readAppConfig.mockRejectedValue(new Error('permission denied'))
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await api.apiReadAppConfig()).toEqual({ disabled: false, contents: null })
    expect(consoleWarn).toHaveBeenCalled()
    consoleWarn.mockRestore()
  })

  it('apiWriteAppConfigSection forwards the section, its version and its value', async () => {
    mocked.writeAppConfigSection.mockResolvedValue(undefined)
    await api.apiWriteAppConfigSection('settings', 1, { language: 'en' })
    expect(mocked.writeAppConfigSection).toHaveBeenCalledWith('settings', 1, { language: 'en' })
  })

  // Unlike the read, a failed save is surfaced — the caller logs it rather than leaving the user to
  // believe a change is on disk when it isn't.
  it('apiWriteAppConfigSection rejects when the save fails', async () => {
    mocked.writeAppConfigSection.mockRejectedValue(new Error('read-only volume'))
    await expect(api.apiWriteAppConfigSection('settings', 1, {})).rejects.toThrow()
  })
})
