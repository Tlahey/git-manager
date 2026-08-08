import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AppConfigLoad } from '../tauri'

const readConfig = vi.fn<() => Promise<AppConfigLoad>>()
const writeSection = vi.fn<(section: string, version: number, value: unknown) => Promise<void>>()

vi.mock('../../api/config.api', () => ({
  apiReadAppConfig: () => readConfig(),
  apiWriteAppConfigSection: (section: string, version: number, value: unknown) =>
    writeSection(section, version, value),
}))

import { flushConfigWrites, loadAppConfig, resetAppConfigForTests } from './appConfigFile'
import { createConfigStorage } from './configStorage'

const storage = createConfigStorage('workspace')
const state = { openTabs: ['/a'], activeRepo: '/a', activeTab: '/a' }

beforeEach(() => {
  readConfig.mockReset().mockResolvedValue({ disabled: false, contents: null })
  writeSection.mockReset().mockResolvedValue(undefined)
  localStorage.clear()
  resetAppConfigForTests()
})

afterEach(() => resetAppConfigForTests())

describe('createConfigStorage — backed by the configuration file', () => {
  beforeEach(async () => {
    readConfig.mockResolvedValue({
      disabled: false,
      contents: JSON.stringify({ workspace: state, versions: { workspace: 3 } }),
    })
    await loadAppConfig()
  })

  it('hands persist the section as the envelope it expects', () => {
    expect(storage.getItem('git-manager-repos-ui')).toEqual({ state, version: 3 })
  })

  it("writes into its own section, at the store's version", async () => {
    storage.setItem('git-manager-repos-ui', { state, version: 3 })
    await flushConfigWrites()
    expect(writeSection).toHaveBeenLastCalledWith('workspace', 3, state)
    expect(localStorage.getItem('git-manager-repos-ui')).toBeNull()
  })

  it('removes the section rather than emptying it on clearStorage', async () => {
    storage.removeItem('git-manager-repos-ui')
    await flushConfigWrites()
    expect(writeSection).toHaveBeenLastCalledWith('workspace', 0, null)
  })
})

describe('createConfigStorage — with the configuration file switched off', () => {
  // GIT_MANAGER_NO_CONFIG, which the e2e suite sets: the store must behave exactly as it did before
  // the file existed, under the same localStorage key, because that is what the suite seeds.
  beforeEach(async () => {
    readConfig.mockResolvedValue({ disabled: true, contents: null })
    await loadAppConfig()
  })

  it('reads its own localStorage key', () => {
    localStorage.setItem('git-manager-repos-ui', JSON.stringify({ state, version: 0 }))
    expect(storage.getItem('git-manager-repos-ui')).toEqual({ state, version: 0 })
  })

  it('writes to localStorage and never touches the file', async () => {
    storage.setItem('git-manager-repos-ui', { state, version: 0 })
    await flushConfigWrites()

    expect(JSON.parse(localStorage.getItem('git-manager-repos-ui')!).state).toEqual(state)
    expect(writeSection).not.toHaveBeenCalled()
  })

  it('removes its localStorage key on clearStorage', () => {
    localStorage.setItem('git-manager-repos-ui', JSON.stringify({ state, version: 0 }))
    storage.removeItem('git-manager-repos-ui')
    expect(localStorage.getItem('git-manager-repos-ui')).toBeNull()
  })
})
