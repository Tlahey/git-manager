import { describe, expect, it } from 'vitest'
import { terminalSessionState } from './terminalState'

describe('terminalSessionState', () => {
  it('is busy while a command holds the terminal', () => {
    expect(terminalSessionState(true, false)).toBe('busy')
  })

  it('is done once a command has finished and nobody has looked', () => {
    expect(terminalSessionState(false, true)).toBe('done')
  })

  it('collapses "never ran" and "already seen" into the same quiet state', () => {
    expect(terminalSessionState(false, false)).toBe('idle')
  })

  it('prefers busy over a stale finished mark — a session running again is running', () => {
    expect(terminalSessionState(true, true)).toBe('busy')
  })
})
