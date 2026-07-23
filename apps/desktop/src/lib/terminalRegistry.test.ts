import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiTerminalWrite = vi.fn()
const apiTerminalResize = vi.fn()
const apiTerminalClose = vi.fn()
const unlisten = vi.fn()
const listen = vi.fn()

interface FakeTerminalShape {
  cols: number
  rows: number
  options: { theme?: { background: string; foreground: string; cursor: string } }
  onDataCb: ((d: string) => void) | null
  open: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
}

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    options: Record<string, unknown> = {}
    onDataCb: ((d: string) => void) | null = null
    open = vi.fn()
    loadAddon = vi.fn()
    write = vi.fn()
    writeln = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    onData(cb: (d: string) => void) {
      this.onDataCb = cb
    }
  },
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn()
  },
}))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('@tauri-apps/api/event', () => ({ listen: (...a: unknown[]) => listen(...a) }))
vi.mock('../api/terminal.api', () => ({
  apiTerminalWrite: (...a: unknown[]) => apiTerminalWrite(...a),
  apiTerminalResize: (...a: unknown[]) => apiTerminalResize(...a),
  apiTerminalClose: (...a: unknown[]) => apiTerminalClose(...a),
}))

import {
  attachTerminal,
  disposeTerminal,
  fitTerminal,
  getOrCreateTerminal,
  hasTerminal,
  setTerminalTheme,
} from './terminalRegistry'

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  listen.mockResolvedValue(unlisten)
})

afterEach(() => {
  // Ensure no session leaks between tests.
  ;['t1', 't2'].forEach((id) => hasTerminal(id) && disposeTerminal(id))
})

describe('terminalRegistry', () => {
  it('creates a session once and reuses it', () => {
    const a = getOrCreateTerminal('t1')
    const b = getOrCreateTerminal('t1')
    expect(a).toBe(b)
    expect(hasTerminal('t1')).toBe(true)
  })

  it('subscribes to the session-scoped output event', () => {
    getOrCreateTerminal('t1')
    expect(listen).toHaveBeenCalledWith('terminal:output:t1', expect.any(Function))
    expect(listen).toHaveBeenCalledWith('terminal:exit:t1', expect.any(Function))
  })

  it('forwards keystrokes to the PTY via onData', () => {
    const entry = getOrCreateTerminal('t1') as unknown as { term: FakeTerminalShape }
    entry.term.onDataCb?.('ls\n')
    expect(apiTerminalWrite).toHaveBeenCalledWith('t1', 'ls\n')
  })

  it('attach opens the terminal once and mounts it into the container', () => {
    const entry = getOrCreateTerminal('t1') as unknown as { term: FakeTerminalShape; el: HTMLElement }
    const container = document.createElement('div')
    attachTerminal('t1', container)
    attachTerminal('t1', container)
    expect(entry.term.open).toHaveBeenCalledTimes(1)
    expect(container.contains(entry.el)).toBe(true)
  })

  it('fit reports the new cell size to the PTY', () => {
    getOrCreateTerminal('t1')
    attachTerminal('t1', document.createElement('div'))
    apiTerminalResize.mockClear()
    fitTerminal('t1')
    expect(apiTerminalResize).toHaveBeenCalledWith('t1', 80, 24)
  })

  it('setTerminalTheme applies the colours live to every open session', () => {
    const entry = getOrCreateTerminal('t1') as unknown as { term: FakeTerminalShape }
    setTerminalTheme({ background: '#101010', foreground: '#fefefe' })
    expect(entry.term.options.theme).toEqual({
      background: '#101010',
      foreground: '#fefefe',
      cursor: '#fefefe',
    })
  })

  it('dispose unsubscribes, kills the PTY and drops the session', async () => {
    const entry = getOrCreateTerminal('t1') as unknown as { term: FakeTerminalShape }
    await flush() // let the listen() promises resolve so unlisten fns are registered
    disposeTerminal('t1')
    expect(unlisten).toHaveBeenCalledTimes(2)
    expect(apiTerminalClose).toHaveBeenCalledWith('t1')
    expect(entry.term.dispose).toHaveBeenCalled()
    expect(hasTerminal('t1')).toBe(false)
  })
})
