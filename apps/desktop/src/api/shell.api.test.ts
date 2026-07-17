import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('../lib/tauri', () => ({
  getTerminalCommands: vi.fn(),
  runTaskInTerminal: vi.fn(),
  getProjectCommands: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import * as api from './shell.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('apiGetTerminalCommands', () => {
  it('delegates to getTerminalCommands', async () => {
    mocked.getTerminalCommands.mockResolvedValue(['git status'])
    expect(await api.apiGetTerminalCommands()).toEqual(['git status'])
  })
})

describe('apiOpenTerminal', () => {
  it('invokes "open_in_terminal" with path/command', async () => {
    invoke.mockResolvedValue(undefined)
    await api.apiOpenTerminal('/repo/a', '/Applications/iTerm.app')
    expect(invoke).toHaveBeenCalledWith('open_in_terminal', {
      path: '/repo/a',
      command: '/Applications/iTerm.app',
    })
  })

  it('logs and swallows the error instead of throwing when the backend call fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    invoke.mockRejectedValue(new Error('no terminal'))
    await expect(api.apiOpenTerminal('/repo/a', '/Applications/iTerm.app')).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('apiRunTask', () => {
  it('delegates to runTaskInTerminal with path/command/terminal', async () => {
    mocked.runTaskInTerminal.mockResolvedValue(undefined)
    await api.apiRunTask('/repo', 'pnpm dev', '/Applications/iTerm.app')
    expect(mocked.runTaskInTerminal).toHaveBeenCalledWith(
      '/repo',
      'pnpm dev',
      '/Applications/iTerm.app'
    )
  })

  it('propagates backend errors (unlike apiOpenTerminal)', async () => {
    mocked.runTaskInTerminal.mockRejectedValue(new Error('boom'))
    await expect(api.apiRunTask('/repo', 'pnpm dev', '')).rejects.toThrow()
  })
})

describe('apiGetProjectCommands', () => {
  it('delegates to getProjectCommands', async () => {
    const commands = [{ name: 'dev', command: 'pnpm dev', source: 'package.json' }]
    mocked.getProjectCommands.mockResolvedValue(commands)
    expect(await api.apiGetProjectCommands('/repo')).toEqual(commands)
    expect(mocked.getProjectCommands).toHaveBeenCalledWith('/repo')
  })
})

describe('apiOpenUrl', () => {
  it('opens the URL via the Tauri shell plugin when available', async () => {
    const open = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@tauri-apps/plugin-shell', () => ({ open }))
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { apiOpenUrl } = await import('./shell.api')
    await apiOpenUrl('https://example.com')

    expect(open).toHaveBeenCalledWith('https://example.com')
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('falls back to window.open and logs when the shell plugin is unavailable', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.doMock('@tauri-apps/plugin-shell', () => {
      throw new Error('not available outside Tauri')
    })
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { apiOpenUrl } = await import('./shell.api')
    await apiOpenUrl('https://example.com')

    expect(windowOpen).toHaveBeenCalledWith('https://example.com', '_blank')
    expect(errorSpy).toHaveBeenCalled()
  })
})
