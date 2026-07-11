import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  generateSshKey: vi.fn(),
  readSshPublicKey: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import * as api from './ssh.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ssh.api pass-throughs', () => {
  it('apiGenerateSshKey forwards every argument, including an optional passphrase', async () => {
    mocked.generateSshKey.mockResolvedValue(undefined)
    await api.apiGenerateSshKey('ed25519', null, 'me@example.com', '/home/me/.ssh/id_ed25519', 'secret')
    expect(mocked.generateSshKey).toHaveBeenCalledWith('ed25519', null, 'me@example.com', '/home/me/.ssh/id_ed25519', 'secret')
  })

  it('apiReadSshPublicKey delegates to readSshPublicKey', async () => {
    mocked.readSshPublicKey.mockResolvedValue('ssh-ed25519 AAAA...')
    expect(await api.apiReadSshPublicKey('/home/me/.ssh/id_ed25519.pub')).toBe('ssh-ed25519 AAAA...')
  })
})
