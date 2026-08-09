import { describe, it, expect } from 'vitest'
import { isIterationBoard, firstIterationName } from './boardIteration'

describe('isIterationBoard', () => {
  it('reads the flag when the board carries one', () => {
    expect(isIterationBoard({ iteration: true })).toBe(true)
    expect(isIterationBoard({ iteration: false })).toBe(false)
  })

  /**
   * Every board written before the field existed was created when closing was the only behaviour
   * there was — reading one as a standing board would quietly remove an action it has always had.
   */
  it('treats a board with no flag as an iteration', () => {
    expect(isIterationBoard({})).toBe(true)
    expect(isIterationBoard({ iteration: undefined })).toBe(true)
  })
})

describe('firstIterationName', () => {
  it('numbers the first iteration so the next one can follow it', () => {
    expect(firstIterationName('Sprint', true)).toBe('Sprint 1')
  })

  /** Someone who typed "Sprint 4" is continuing a count that started before this app. */
  it('leaves a name that already ends in a number alone', () => {
    expect(firstIterationName('Sprint 4', true)).toBe('Sprint 4')
    expect(firstIterationName('Sprint 4 ', true)).toBe('Sprint 4')
    expect(firstIterationName('2026-Q1', true)).toBe('2026-Q1')
  })

  /** A standing board is not the first of anything. */
  it('does not number a board that is not an iteration', () => {
    expect(firstIterationName('Backlog', false)).toBe('Backlog')
  })

  it('trims either way', () => {
    expect(firstIterationName('  Sprint  ', true)).toBe('Sprint 1')
    expect(firstIterationName('  Backlog  ', false)).toBe('Backlog')
  })
})
