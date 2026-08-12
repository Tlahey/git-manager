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
  useTerminalStore.setState({ open: false, height: 260, sessions: [], activeId: null })
  apiTerminalOpen.mockReset()
  getOrCreateTerminal.mockReset()
  disposeTerminal.mockReset()
}

describe('useIntegratedTerminal', () => {
  beforeEach(reset)

  it('addSession opens a PTY, registers the xterm and adds a numbered session', async () => {
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
    const sessions = useTerminalStore.getState().sessions
    expect(sessions.map((s) => s.id)).toEqual(['id-1', 'id-2'])
    expect(sessions.map((s) => s.title)).toEqual(['zsh 1', 'zsh 2'])
  })

  it('binds a new session to the path on screen when it was opened, not to the previous one', async () => {
    apiTerminalOpen.mockResolvedValueOnce('agent').mockResolvedValueOnce('shell')
    const onWorktree = renderHook(() => useIntegratedTerminal('/repo/worktree-a'))
    await act(async () => {
      await onWorktree.result.current.addSession()
    })

    // The user entered another workspace; the hook is now driven by that path.
    const onRepo = renderHook(() => useIntegratedTerminal('/repo'))
    await act(async () => {
      await onRepo.result.current.addSession()
    })

    const state = useTerminalStore.getState()
    expect(state.sessionsFor('/repo/worktree-a').map((s) => s.id)).toEqual(['agent'])
    expect(state.sessionsFor('/repo').map((s) => s.id)).toEqual(['shell'])
    // The freshly opened one is what the panel shows.
    expect(state.activeId).toBe('shell')
  })

  it('numbers sessions across directories so no two tabs share a label', async () => {
    apiTerminalOpen.mockResolvedValueOnce('a').mockResolvedValueOnce('b')
    const first = renderHook(() => useIntegratedTerminal('/repo'))
    await act(async () => {
      await first.result.current.addSession()
    })
    const second = renderHook(() => useIntegratedTerminal('/repo/worktree-a'))
    await act(async () => {
      await second.result.current.addSession()
    })

    expect(useTerminalStore.getState().sessions.map((s) => s.title)).toEqual(['zsh 1', 'zsh 2'])
  })

  it('openTerminal opens the panel and spawns a first session only when none exists', async () => {
    apiTerminalOpen.mockResolvedValue('id-1')
    const { result } = renderHook(() => useIntegratedTerminal('/repo'))

    await act(async () => {
      await result.current.openTerminal()
    })
    expect(useTerminalStore.getState().open).toBe(true)
    expect(apiTerminalOpen).toHaveBeenCalledTimes(1)

    // Second open (a session already exists) must not spawn another one.
    await act(async () => {
      await result.current.openTerminal()
    })
    expect(apiTerminalOpen).toHaveBeenCalledTimes(1)
  })

  it('reopening the panel from another workspace restores the running session, it does not spawn', async () => {
    apiTerminalOpen.mockResolvedValue('agent')
    const onWorktree = renderHook(() => useIntegratedTerminal('/repo/worktree-a'))
    await act(async () => {
      await onWorktree.result.current.openTerminal()
    })
    act(() => {
      useTerminalStore.getState().closePanel()
    })

    const onRepo = renderHook(() => useIntegratedTerminal('/repo'))
    await act(async () => {
      await onRepo.result.current.toggle()
    })

    expect(apiTerminalOpen).toHaveBeenCalledTimes(1)
    expect(useTerminalStore.getState().open).toBe(true)
    expect(useTerminalStore.getState().activeId).toBe('agent')
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

  it('closeSession disposes the xterm and drops the session', async () => {
    apiTerminalOpen.mockResolvedValue('id-1')
    const { result } = renderHook(() => useIntegratedTerminal('/repo'))
    await act(async () => {
      await result.current.addSession()
    })

    act(() => {
      result.current.closeSession('id-1')
    })
    expect(disposeTerminal).toHaveBeenCalledWith('id-1')
    expect(useTerminalStore.getState().sessions).toEqual([])
  })

  it('closeAllSessions disposes every session, wherever it was spawned, and closes the panel', async () => {
    apiTerminalOpen.mockResolvedValueOnce('id-1').mockResolvedValueOnce('id-2')
    useTerminalStore.setState({ open: true })
    const onRepo = renderHook(() => useIntegratedTerminal('/repo'))
    const onWorktree = renderHook(() => useIntegratedTerminal('/repo/worktree-a'))
    await act(async () => {
      await onRepo.result.current.addSession()
      await onWorktree.result.current.addSession()
    })

    act(() => {
      onRepo.result.current.closeAllSessions()
    })
    expect(disposeTerminal).toHaveBeenCalledWith('id-1')
    expect(disposeTerminal).toHaveBeenCalledWith('id-2')
    expect(useTerminalStore.getState().sessions).toEqual([])
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
