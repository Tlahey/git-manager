import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiTerminalOpen = vi.fn()
const getOrCreateTerminal = vi.fn()
const disposeTerminal = vi.fn()

vi.mock('../api/terminal.api', () => ({
  apiTerminalOpen: (...args: unknown[]) => apiTerminalOpen(...args),
}))
vi.mock('../lib/terminalRegistry', () => ({
  getOrCreateTerminal: (...args: unknown[]) => getOrCreateTerminal(...args),
  disposeTerminal: (...args: unknown[]) => disposeTerminal(...args),
}))

import { useIntegratedTerminal } from './useIntegratedTerminal'
import { useTerminalStore } from '../stores/terminal.store'

const reset = () => {
  useTerminalStore.setState({ open: false, height: 260, byPath: {} })
  apiTerminalOpen.mockReset()
  getOrCreateTerminal.mockReset()
  disposeTerminal.mockReset()
}

describe('useIntegratedTerminal', () => {
  beforeEach(reset)

  it('addSession opens a PTY, registers the xterm and adds a numbered tab', async () => {
    apiTerminalOpen.mockResolvedValueOnce('id-1').mockResolvedValueOnce('id-2')
    const { result } = renderHook(() => useIntegratedTerminal('/repo'))

    await act(async () => {
      await result.current.addSession()
    })
    await act(async () => {
      await result.current.addSession()
    })

    expect(apiTerminalOpen).toHaveBeenCalledWith('/repo', 80, 24)
    expect(getOrCreateTerminal).toHaveBeenCalledWith('id-1')
    const tabs = useTerminalStore.getState().tabsFor('/repo').tabs
    expect(tabs.map((t) => t.id)).toEqual(['id-1', 'id-2'])
    expect(tabs.map((t) => t.title)).toEqual(['zsh 1', 'zsh 2'])
  })

  it('openTerminal opens the panel and spawns a first session only when empty', async () => {
    apiTerminalOpen.mockResolvedValue('id-1')
    const { result } = renderHook(() => useIntegratedTerminal('/repo'))

    await act(async () => {
      await result.current.openTerminal()
    })
    expect(useTerminalStore.getState().open).toBe(true)
    expect(apiTerminalOpen).toHaveBeenCalledTimes(1)

    // Second open (panel already has a tab) must not spawn another session.
    await act(async () => {
      await result.current.openTerminal()
    })
    expect(apiTerminalOpen).toHaveBeenCalledTimes(1)
  })

  it('toggle closes the panel when it is open', async () => {
    useTerminalStore.setState({ open: true })
    const { result } = renderHook(() => useIntegratedTerminal('/repo'))
    await act(async () => {
      await result.current.toggle()
    })
    expect(useTerminalStore.getState().open).toBe(false)
    expect(apiTerminalOpen).not.toHaveBeenCalled()
  })

  it('closeSession disposes the xterm and removes the tab', async () => {
    apiTerminalOpen.mockResolvedValue('id-1')
    const { result } = renderHook(() => useIntegratedTerminal('/repo'))
    await act(async () => {
      await result.current.addSession()
    })

    act(() => {
      result.current.closeSession('id-1')
    })
    expect(disposeTerminal).toHaveBeenCalledWith('id-1')
    expect(useTerminalStore.getState().tabsFor('/repo').tabs).toEqual([])
  })

  it('closeAllSessions disposes all xterm sessions and closes the panel', async () => {
    apiTerminalOpen.mockResolvedValueOnce('id-1').mockResolvedValueOnce('id-2')
    useTerminalStore.setState({ open: true })
    const { result } = renderHook(() => useIntegratedTerminal('/repo'))
    await act(async () => {
      await result.current.addSession()
      await result.current.addSession()
    })

    act(() => {
      result.current.closeAllSessions()
    })
    expect(disposeTerminal).toHaveBeenCalledWith('id-1')
    expect(disposeTerminal).toHaveBeenCalledWith('id-2')
    expect(useTerminalStore.getState().tabsFor('/repo').tabs).toEqual([])
    expect(useTerminalStore.getState().open).toBe(false)
  })

  it('does nothing without a path', async () => {
    const { result } = renderHook(() => useIntegratedTerminal(null))
    await act(async () => {
      await result.current.addSession()
    })
    expect(apiTerminalOpen).not.toHaveBeenCalled()
  })
})
