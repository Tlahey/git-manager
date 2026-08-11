import { describe, it, expect, vi, beforeEach } from 'vitest'

const { storeCredential, deleteCredential, hasCredential } = vi.hoisted(() => ({
  storeCredential: vi.fn().mockResolvedValue(undefined),
  deleteCredential: vi.fn().mockResolvedValue(undefined),
  hasCredential: vi.fn().mockResolvedValue(true),
}))
vi.mock('../lib/tauri', () => ({
  AI_CREDENTIAL_ID: 'provider',
  storeCredential,
  deleteCredential,
  hasCredential,
}))

import * as credentials from './credentials.api'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('credentials.api', () => {
  /**
   * The invariant this whole arrangement exists for. A `get` here would be a way for the webview to
   * obtain a token, which is exactly the capability moving the secrets into the OS keychain removed
   * — so the module's *absence* of a read is worth asserting, not just documenting.
   */
  it('exposes no way to read a secret', () => {
    const names = Object.keys(credentials)
    expect(names).not.toContain('apiGetCredential')
    expect(names.filter((n) => /^apiGet|^apiRead|Secret$/.test(n))).toEqual([])
  })

  it('files a forge credential under the account id', async () => {
    await credentials.apiStoreCredential('github', 'ghp_secret', 'octocat')
    expect(storeCredential).toHaveBeenCalledWith('github', 'octocat', 'ghp_secret')
  })

  /** There is one configured AI provider, so its key has a fixed slot and callers pass no id. */
  it('files the AI key under its single fixed slot', async () => {
    await credentials.apiStoreCredential('ai', 'sk-secret')
    expect(storeCredential).toHaveBeenCalledWith('ai', 'provider', 'sk-secret')
  })

  it('refuses a forge credential with no account to file it under', async () => {
    await expect(credentials.apiStoreCredential('gitlab', 'glpat')).rejects.toThrow(Error)
    expect(storeCredential).not.toHaveBeenCalled()
  })

  it('deletes a forge credential by account id, and the AI key by its slot', async () => {
    await credentials.apiDeleteCredential('github', 'octocat')
    expect(deleteCredential).toHaveBeenCalledWith('github', 'octocat')

    await credentials.apiDeleteCredential('ai')
    expect(deleteCredential).toHaveBeenCalledWith('ai', 'provider')
  })

  /** A boolean is the one thing about a credential the frontend may learn. */
  it('reports whether a credential exists', async () => {
    hasCredential.mockResolvedValue(false)
    await expect(credentials.apiHasCredential('github', 'octocat')).resolves.toBe(false)
    expect(hasCredential).toHaveBeenCalledWith('github', 'octocat')
  })
})
