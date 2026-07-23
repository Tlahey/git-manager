import { beforeEach, describe, expect, it } from 'vitest'
import { useTerminalStore } from './terminal.store'

const reset = () => useTerminalStore.setState({ open: false, height: 260, byPath: {} })

const tab = (id: string, cwd = '/repo') => ({ id, title: `zsh ${id}`, cwd })

describe('useTerminalStore', () => {
  beforeEach(reset)

  it('starts closed with no sessions', () => {
    const s = useTerminalStore.getState()
    expect(s.open).toBe(false)
    expect(s.byPath).toEqual({})
    expect(s.tabsFor('/repo')).toEqual({ tabs: [], activeId: null })
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

  it('addTab appends and activates the new session', () => {
    useTerminalStore.getState().addTab('/repo', tab('a'))
    useTerminalStore.getState().addTab('/repo', tab('b'))
    const s = useTerminalStore.getState().tabsFor('/repo')
    expect(s.tabs.map((t) => t.id)).toEqual(['a', 'b'])
    expect(s.activeId).toBe('b')
  })

  it('keeps sessions isolated per path', () => {
    useTerminalStore.getState().addTab('/repo', tab('a'))
    useTerminalStore.getState().addTab('/other', tab('x', '/other'))
    expect(useTerminalStore.getState().tabsFor('/repo').tabs.map((t) => t.id)).toEqual(['a'])
    expect(useTerminalStore.getState().tabsFor('/other').tabs.map((t) => t.id)).toEqual(['x'])
  })

  it('removeTab activates the previous neighbour when the active tab closes', () => {
    const store = useTerminalStore.getState()
    store.addTab('/repo', tab('a'))
    store.addTab('/repo', tab('b'))
    store.addTab('/repo', tab('c'))
    store.setActiveTab('/repo', 'b')
    store.removeTab('/repo', 'b')
    const s = useTerminalStore.getState().tabsFor('/repo')
    expect(s.tabs.map((t) => t.id)).toEqual(['a', 'c'])
    expect(s.activeId).toBe('a')
  })

  it('removeTab leaves activeId null once the last tab is closed', () => {
    useTerminalStore.getState().addTab('/repo', tab('a'))
    useTerminalStore.getState().removeTab('/repo', 'a')
    expect(useTerminalStore.getState().tabsFor('/repo')).toEqual({ tabs: [], activeId: null })
  })

  it('removeTab keeps the active tab when a different one closes', () => {
    const store = useTerminalStore.getState()
    store.addTab('/repo', tab('a'))
    store.addTab('/repo', tab('b'))
    store.setActiveTab('/repo', 'b')
    store.removeTab('/repo', 'a')
    expect(useTerminalStore.getState().tabsFor('/repo').activeId).toBe('b')
  })
})
