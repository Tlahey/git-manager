import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('../lib/tauri', () => ({ getTerminalCommands: vi.fn() }))

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
  it('invokes "open_in_terminal" with path/terminal/customCommand', async () => {
    invoke.mockResolvedValue(undefined)
    await api.apiOpenTerminal('/repo/a', 'iterm', 'my-term {path}')
    expect(invoke).toHaveBeenCalledWith('open_in_terminal', { path: '/repo/a', terminal: 'iterm', customCommand: 'my-term {path}' })
  })

  it('logs and swallows the error instead of throwing when the backend call fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    invoke.mockRejectedValue(new Error('no terminal'))
    await expect(api.apiOpenTerminal('/repo/a', 'iterm')).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
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
