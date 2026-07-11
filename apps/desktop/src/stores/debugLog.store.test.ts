import { describe, it, expect, beforeEach } from 'vitest'
import { useDebugLogStore } from './debugLog.store'

function reset() {
  useDebugLogStore.setState({ enabled: false, entries: [] })
}

function addEntry(command: string) {
  useDebugLogStore.getState().add({ command, durationMs: 1, status: 'ok' })
}

describe('useDebugLogStore', () => {
  beforeEach(reset)

  it('defaults to disabled with no entries', () => {
    expect(useDebugLogStore.getState().enabled).toBe(false)
    expect(useDebugLogStore.getState().entries).toEqual([])
  })

  it('toggles enabled', () => {
    useDebugLogStore.getState().setEnabled(true)
    expect(useDebugLogStore.getState().enabled).toBe(true)
  })

  it('adds entries newest-first with a generated id and timestamp', () => {
    addEntry('first')
    addEntry('second')
    const { entries } = useDebugLogStore.getState()
    expect(entries.map((e) => e.command)).toEqual(['second', 'first'])
    expect(entries[0].id).toBeTruthy()
    expect(entries[0].id).not.toBe(entries[1].id)
    expect(entries[0].timestamp).toBeGreaterThan(0)
  })

  it('caps the buffer at 200 entries, dropping the oldest', () => {
    for (let i = 0; i < 205; i++) addEntry(`cmd-${i}`)
    const { entries } = useDebugLogStore.getState()
    expect(entries).toHaveLength(200)
    expect(entries[0].command).toBe('cmd-204') // newest kept
    expect(entries[entries.length - 1].command).toBe('cmd-5') // cmd-0..4 evicted
  })

  it('clears all entries', () => {
    addEntry('x')
    useDebugLogStore.getState().clear()
    expect(useDebugLogStore.getState().entries).toEqual([])
  })
})
