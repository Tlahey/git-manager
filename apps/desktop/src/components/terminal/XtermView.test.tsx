import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const getOrCreateTerminal = vi.fn()
const attachTerminal = vi.fn()
const detachTerminal = vi.fn()
const fitTerminal = vi.fn()

vi.mock('../../lib/terminalRegistry', () => ({
  getOrCreateTerminal: (...a: unknown[]) => getOrCreateTerminal(...a),
  attachTerminal: (...a: unknown[]) => attachTerminal(...a),
  detachTerminal: (...a: unknown[]) => detachTerminal(...a),
  fitTerminal: (...a: unknown[]) => fitTerminal(...a),
}))

import { XtermView } from './XtermView'

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom has no ResizeObserver — provide a no-op stub.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
})

describe('XtermView', () => {
  it('attaches the session on mount and detaches (without disposing) on unmount', () => {
    const { unmount } = render(<XtermView id="t1" />)
    expect(getOrCreateTerminal).toHaveBeenCalledWith('t1')
    expect(attachTerminal).toHaveBeenCalledWith('t1', expect.any(HTMLElement))

    unmount()
    expect(detachTerminal).toHaveBeenCalledWith('t1')
  })
})
