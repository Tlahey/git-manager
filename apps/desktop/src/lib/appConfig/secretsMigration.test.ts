import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { AppConfigLoad } from '../tauri'

const { apiStoreCredential, readConfig, writeSection } = vi.hoisted(() => ({
  apiStoreCredential: vi.fn().mockResolvedValue(undefined),
  readConfig: vi.fn(),
  writeSection: vi.fn(),
}))
vi.mock('../../api/credentials.api', () => ({ apiStoreCredential }))
vi.mock('../../api/config.api', () => ({
  apiReadAppConfig: () => readConfig() as Promise<AppConfigLoad>,
  apiWriteAppConfigSection: (section: string, version: number, value: unknown) =>
    writeSection(section, version, value) as Promise<void>,
}))

import { extractSecrets, migrateSecretsOutOfSettings, type PendingSecret } from './secretsMigration'
import {
  flushConfigWrites,
  loadAppConfig,
  readConfigSection,
  resetAppConfigForTests,
} from './appConfigFile'
import { SECTION_LEGACY_KEYS } from './sections'

function user(login: string) {
  return { login, name: null, email: null, avatarUrl: '' }
}

/**
 * A settings object of the vintage this migration exists for: every secret still in the file.
 *
 * Kept schema-valid on purpose. `validate.ts` resets any settings *group* that does not match its
 * schema, so a group the file has mangled loses its accounts anyway and has no secret left to move —
 * the migration only ever sees well-formed groups, and a fixture that skipped a required field would
 * be testing the validator rather than this.
 */
function legacySettings() {
  return {
    ai: {
      preset: 'openai-compatible',
      url: 'http://x',
      model: 'm',
      timeoutSeconds: 120,
      apiKey: 'sk-secret',
    },
    github: {
      accounts: [
        { id: 'octocat', token: 'ghp_octo', user: user('octocat') },
        { id: 'hubot', token: 'ghp_hubot', user: user('hubot') },
      ],
      activeAccountId: 'octocat',
    },
    integrations: {
      gitlabAccounts: [
        { id: 'a@gitlab.com', host: 'https://gitlab.com', username: 'a', token: 'glpat' },
      ],
      gitlabActiveAccountId: 'a@gitlab.com',
      bitbucketAccounts: [
        { id: 'b@bitbucket.org', host: 'https://bitbucket.org', username: 'b', token: 'bb' },
      ],
      bitbucketActiveAccountId: 'b@bitbucket.org',
    },
    language: 'en',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  apiStoreCredential.mockResolvedValue(undefined)
  readConfig.mockReset().mockResolvedValue({ disabled: false, contents: null })
  writeSection.mockReset().mockResolvedValue(undefined)
  resetAppConfigForTests()
  globalThis.localStorage.clear()
})

describe('extractSecrets', () => {
  it('finds every secret, keyed by the account it belongs to', () => {
    const { secrets } = extractSecrets(legacySettings())
    expect(secrets).toEqual<PendingSecret[]>([
      { kind: 'github', id: 'octocat', secret: 'ghp_octo' },
      { kind: 'github', id: 'hubot', secret: 'ghp_hubot' },
      { kind: 'gitlab', id: 'a@gitlab.com', secret: 'glpat' },
      { kind: 'bitbucket', id: 'b@bitbucket.org', secret: 'bb' },
      // The AI key has a single slot, so it carries no id.
      { kind: 'ai', secret: 'sk-secret' },
    ])
  })

  it('strips the secrets and leaves everything else untouched', () => {
    const { stripped } = extractSecrets(legacySettings()) as { stripped: Record<string, unknown> }
    expect(JSON.stringify(stripped)).not.toContain('ghp_octo')
    expect(JSON.stringify(stripped)).not.toContain('sk-secret')
    expect(stripped.ai).toEqual({
      preset: 'openai-compatible',
      url: 'http://x',
      model: 'm',
      timeoutSeconds: 120,
    })
    expect(stripped.language).toBe('en')
    // The public half of every account survives — that is the whole point: nobody reconnects.
    expect((stripped.github as { accounts: unknown[] }).accounts).toEqual([
      { id: 'octocat', user: user('octocat') },
      { id: 'hubot', user: user('hubot') },
    ])
    expect((stripped.github as { activeAccountId: string }).activeAccountId).toBe('octocat')
  })

  /**
   * What makes the migration run exactly once without a flag: having moved the secrets there is
   * nothing left to find, so a second pass is a no-op and returns the object it was given.
   */
  it('finds nothing in already-migrated settings, and does not copy them', () => {
    const clean = extractSecrets(legacySettings()).stripped
    const second = extractSecrets(clean)
    expect(second.secrets).toEqual([])
    expect(second.stripped).toBe(clean)
  })

  it('drops a blank AI key rather than storing one', () => {
    const { secrets, stripped } = extractSecrets({ ai: { model: 'm', apiKey: '' } })
    expect(secrets).toEqual([])
    // Still removed from the file: the field itself is what is going away.
    expect(stripped).toEqual({ ai: { model: 'm' } })
  })

  it('survives any shape a hand-edited file might have', () => {
    expect(extractSecrets(null).secrets).toEqual([])
    expect(extractSecrets('nonsense').secrets).toEqual([])
    expect(extractSecrets({ github: { accounts: 'not-a-list' } }).secrets).toEqual([])
    expect(extractSecrets({ github: {} }).secrets).toEqual([])
  })

  /** An account with no id cannot be filed anywhere, so the token goes rather than being guessed. */
  it('does not store a token for an account with no id', () => {
    const { secrets, stripped } = extractSecrets({ github: { accounts: [{ token: 'orphan' }] } })
    expect(secrets).toEqual([])
    expect(JSON.stringify(stripped)).not.toContain('orphan')
  })
})

describe('migrateSecretsOutOfSettings — through the configuration file', () => {
  /** Puts a file-era settings blob on "disk" and loads it, exactly as a launch would. */
  async function seedFile(settings: unknown) {
    readConfig.mockResolvedValue({
      disabled: false,
      contents: JSON.stringify({ settings, versions: { settings: 1 } }),
    })
    await loadAppConfig()
  }

  it('moves every secret to the keychain and rewrites the settings without them', async () => {
    await seedFile(legacySettings())

    expect(await migrateSecretsOutOfSettings()).toBe(5)

    expect(apiStoreCredential).toHaveBeenCalledWith('github', 'ghp_octo', 'octocat')
    expect(apiStoreCredential).toHaveBeenCalledWith('gitlab', 'glpat', 'a@gitlab.com')
    expect(apiStoreCredential).toHaveBeenCalledWith('ai', 'sk-secret', undefined)

    const after = readConfigSection('settings')!.state
    expect(JSON.stringify(after)).not.toContain('ghp_octo')
    expect(JSON.stringify(after)).not.toContain('sk-secret')
  })

  it('does nothing when there is no settings section at all', async () => {
    await loadAppConfig()
    expect(await migrateSecretsOutOfSettings()).toBe(0)
    expect(apiStoreCredential).not.toHaveBeenCalled()
  })

  it('does nothing on a second run', async () => {
    await seedFile(legacySettings())
    await migrateSecretsOutOfSettings()
    await flushConfigWrites()
    apiStoreCredential.mockClear()

    expect(await migrateSecretsOutOfSettings()).toBe(0)
    expect(apiStoreCredential).not.toHaveBeenCalled()
  })

  /**
   * The one outcome worse than not migrating: a file stripped of a token that never reached the
   * keychain. So a failure leaves the settings exactly as they were, and the next launch retries.
   */
  it('leaves the settings untouched when the keychain refuses', async () => {
    await seedFile(legacySettings())
    apiStoreCredential.mockRejectedValue(new Error('keychain locked'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await migrateSecretsOutOfSettings()).toBe(0)

    expect(JSON.stringify(readConfigSection('settings')!.state)).toContain('ghp_octo')
  })

  /**
   * `main.tsx` awaits this before the first render, so anything that escapes it is a blank window.
   * A failed migration costs some reconnected accounts and is retried next launch; a blank window
   * is not recoverable by the user at all.
   */
  it('never rejects, whatever the settings turn out to look like', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    readConfig.mockResolvedValue({
      disabled: false,
      contents: JSON.stringify({ settings: legacySettings(), versions: { settings: 1 } }),
    })
    await loadAppConfig()
    apiStoreCredential.mockImplementation(() => {
      throw new Error('synchronous explosion')
    })

    await expect(migrateSecretsOutOfSettings()).resolves.toBe(0)
  })
})

describe('migrateSecretsOutOfSettings — with the configuration file switched off', () => {
  // `GIT_MANAGER_NO_CONFIG` (what the e2e suite runs with) puts the settings back in localStorage,
  // and `resetAppConfigForTests` leaves the module in the same "not loaded" state, so this is the
  // path a unit test takes by default.
  it('migrates the localStorage snapshot and writes it back without the secrets', async () => {
    globalThis.localStorage.setItem(
      SECTION_LEGACY_KEYS.settings,
      JSON.stringify({ state: legacySettings(), version: 1 })
    )

    expect(await migrateSecretsOutOfSettings()).toBe(5)

    const written = globalThis.localStorage.getItem(SECTION_LEGACY_KEYS.settings)!
    expect(written).not.toContain('ghp_octo')
    expect(written).not.toContain('sk-secret')
    expect(JSON.parse(written)).toMatchObject({ version: 1 })
    expect(JSON.parse(written).state.github.accounts[0].id).toBe('octocat')
  })

  /** The pre-file envelope nested the settings once more; that vintage is exactly the one with
   * tokens still to move, so both shapes are accepted. */
  it('accepts the older doubly-wrapped envelope', async () => {
    globalThis.localStorage.setItem(
      SECTION_LEGACY_KEYS.settings,
      JSON.stringify({ state: { settings: legacySettings() }, version: 0 })
    )

    expect(await migrateSecretsOutOfSettings()).toBe(5)
    expect(globalThis.localStorage.getItem(SECTION_LEGACY_KEYS.settings)).not.toContain('ghp_octo')
  })

  it('does nothing when there is no snapshot', async () => {
    expect(await migrateSecretsOutOfSettings()).toBe(0)
  })
})
