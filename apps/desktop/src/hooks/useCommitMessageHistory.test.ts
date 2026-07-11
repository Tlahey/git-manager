import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCommitMessageHistory } from './useCommitMessageHistory'

describe('useCommitMessageHistory', () => {
  it('starts with empty history', () => {
    const { result } = renderHook(() => useCommitMessageHistory())
    expect(result.current.history).toEqual([])
  })

  it('addMessage prepends the message', () => {
    const { result } = renderHook(() => useCommitMessageHistory())
    act(() => result.current.addMessage('feat: add thing'))
    expect(result.current.history).toEqual(['feat: add thing'])
  })

  it('ignores blank/whitespace-only messages', () => {
    const { result } = renderHook(() => useCommitMessageHistory())
    act(() => result.current.addMessage('   '))
    expect(result.current.history).toEqual([])
  })

  it('moves a re-added message to the front instead of duplicating it', () => {
    const { result } = renderHook(() => useCommitMessageHistory())
    act(() => result.current.addMessage('first'))
    act(() => result.current.addMessage('second'))
    act(() => result.current.addMessage('first'))
    expect(result.current.history).toEqual(['first', 'second'])
  })

  it('caps history at 10 entries, dropping the oldest', () => {
    const { result } = renderHook(() => useCommitMessageHistory())
    for (let i = 0; i < 12; i++) {
      act(() => result.current.addMessage(`msg-${i}`))
    }
    expect(result.current.history).toHaveLength(10)
    expect(result.current.history[0]).toBe('msg-11')
    expect(result.current.history).not.toContain('msg-0')
    expect(result.current.history).not.toContain('msg-1')
  })

  it('clearHistory empties the list', () => {
    const { result } = renderHook(() => useCommitMessageHistory())
    act(() => result.current.addMessage('a'))
    act(() => result.current.clearHistory())
    expect(result.current.history).toEqual([])
  })
})
