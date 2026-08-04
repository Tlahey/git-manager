import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardStore } from './board.store'

beforeEach(() => {
  useBoardStore.setState({ activeBoardIdByRepo: {}, collapsedColumns: {} })
  localStorage.clear()
})

describe('board.store', () => {
  it('tracks the active board id per repo path independently', () => {
    useBoardStore.getState().setActiveBoard('/repo-a', 'board-1')
    useBoardStore.getState().setActiveBoard('/repo-b', 'board-2')

    expect(useBoardStore.getState().activeBoardIdByRepo).toEqual({
      '/repo-a': 'board-1',
      '/repo-b': 'board-2',
    })
  })

  it('toggles a column collapsed and back', () => {
    const { toggleColumnCollapsed, isColumnCollapsed } = useBoardStore.getState()
    expect(isColumnCollapsed('board-1', 'todo')).toBe(false)

    toggleColumnCollapsed('board-1', 'todo')
    expect(useBoardStore.getState().isColumnCollapsed('board-1', 'todo')).toBe(true)

    useBoardStore.getState().toggleColumnCollapsed('board-1', 'todo')
    expect(useBoardStore.getState().isColumnCollapsed('board-1', 'todo')).toBe(false)
  })

  it('keeps collapsed state independent per board even for the same column id', () => {
    useBoardStore.getState().toggleColumnCollapsed('board-1', 'todo')
    expect(useBoardStore.getState().isColumnCollapsed('board-1', 'todo')).toBe(true)
    expect(useBoardStore.getState().isColumnCollapsed('board-2', 'todo')).toBe(false)
  })
})
