import { describe, it, expect } from 'vitest'
import { boardConflictError, isBoardConflict, BOARD_CONFLICT_CODE } from './boardConflict'

describe('boardConflict', () => {
  it('recognises the error it produces', () => {
    const error = boardConflictError('This board changed since it was last read')
    expect(error.message).toBe('This board changed since it was last read')
    expect(isBoardConflict(error)).toBe(true)
  })

  it('recognises the plain object the Tauri boundary hands back', () => {
    expect(isBoardConflict({ code: BOARD_CONFLICT_CODE, message: 'stale' })).toBe(true)
  })

  it('leaves every other failure alone', () => {
    expect(isBoardConflict(new Error('network down'))).toBe(false)
    expect(isBoardConflict({ code: 'GIT_ERROR' })).toBe(false)
    expect(isBoardConflict(null)).toBe(false)
    expect(isBoardConflict('BOARD_CONFLICT')).toBe(false)
  })
})
