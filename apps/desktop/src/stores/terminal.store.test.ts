import { beforeEach, describe, expect, it } from 'vitest'
import { useTerminalStore } from './terminal.store'

const reset = () =>
  useTerminalStore.setState({ open: false, height: 260, sessions: [], activeId: null })

const session = (id: string, cwd = '/repo') => ({ id, title: `zsh ${id}`, cwd })

describe('useTerminalStore', () => {
  beforeEach(reset)

  it('starts closed with no sessions', () => {
    const s = useTerminalStore.getState()
    expect(s.open).toBe(false)
    expect(s.sessions).toEqual([])
    expect(s.activeId).toBeNull()
    expect(s.sessionsFor('/repo')).toEqual([])
  })

  it('openPanel / closePanel / togglePanel flip visibility', () => {
    useTerminalStore.getState().openPanel()
    expect(useTerminalStore.getState().open).toBe(true)
    useTerminalStore.getState().closePanel()
    expect(useTerminalStore.getState().open).toBe(false)
    useTerminalStore.getState().togglePanel()
    expect(useTerminalStore.getState().open).toBe(true)
  })

  it('clamps height between the min and max bounds', () => {
    useTerminalStore.getState().setHeight(10)
    expect(useTerminalStore.getState().height).toBe(120)
    useTerminalStore.getState().setHeight(5000)
    expect(useTerminalStore.getState().height).toBe(900)
    useTerminalStore.getState().setHeight(300)
    expect(useTerminalStore.getState().height).toBe(300)
  })

  it('addSession appends and activates the new session', () => {
    useTerminalStore.getState().addSession(session('a'))
    useTerminalStore.getState().addSession(session('b'))
    const s = useTerminalStore.getState()
    expect(s.sessions.map((x) => x.id)).toEqual(['a', 'b'])
    expect(s.activeId).toBe('b')
  })

  it('keeps every session in one list whatever directory it belongs to', () => {
    useTerminalStore.getState().addSession(session('a'))
    useTerminalStore.getState().addSession(session('x', '/worktree'))
    const s = useTerminalStore.getState()
    expect(s.sessions.map((x) => x.id)).toEqual(['a', 'x'])
    expect(s.sessionsFor('/repo').map((x) => x.id)).toEqual(['a'])
    expect(s.sessionsFor('/worktree').map((x) => x.id)).toEqual(['x'])
  })

  it('leaves the shown session alone when another directory becomes the one on screen', () => {
    // The whole point of the flat list: entering another workspace is a view change, and a running
    // shell is not part of the view. Nothing in the store even knows the workspace changed.
    useTerminalStore.getState().addSession(session('agent', '/worktree'))
    expect(useTerminalStore.getState().activeId).toBe('agent')
    expect(useTerminalStore.getState().sessions).toHaveLength(1)
  })

  it('removeSession activates the previous neighbour when the shown session closes', () => {
    const store = useTerminalStore.getState()
    store.addSession(session('a'))
    store.addSession(session('b'))
    store.addSession(session('c'))
    store.setActiveSession('b')
    store.removeSession('b')
    const s = useTerminalStore.getState()
    expect(s.sessions.map((x) => x.id)).toEqual(['a', 'c'])
    expect(s.activeId).toBe('a')
  })

  it('removeSession leaves activeId null once the last session is closed', () => {
    useTerminalStore.getState().addSession(session('a'))
    useTerminalStore.getState().removeSession('a')
    expect(useTerminalStore.getState().sessions).toEqual([])
    expect(useTerminalStore.getState().activeId).toBeNull()
  })

  it('removeSession keeps the shown session when a different one closes', () => {
    const store = useTerminalStore.getState()
    store.addSession(session('a'))
    store.addSession(session('b'))
    store.setActiveSession('b')
    store.removeSession('a')
    expect(useTerminalStore.getState().activeId).toBe('b')
  })

  it('removeSession ignores an id that is not a live session', () => {
    useTerminalStore.getState().addSession(session('a'))
    useTerminalStore.getState().removeSession('gone')
    expect(useTerminalStore.getState().sessions.map((s) => s.id)).toEqual(['a'])
    expect(useTerminalStore.getState().activeId).toBe('a')
  })
})
