import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardStore } from './board.store'

beforeEach(() => {
  useBoardStore.setState({ activeBoardIdByRepo: {}, collapsedColumns: {}, collapsedCardSections: {} })
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

  /** Per section, not per card: folding the checklist again on every card opened would make the
   * preference worthless. */
  it('folds a card-dialog section for every card at once', () => {
    useBoardStore.getState().toggleCardSectionCollapsed('card-dod')
    expect(useBoardStore.getState().isCardSectionCollapsed('card-dod')).toBe(true)
    expect(useBoardStore.getState().isCardSectionCollapsed('card-description')).toBe(false)

    useBoardStore.getState().toggleCardSectionCollapsed('card-dod')
    expect(useBoardStore.getState().isCardSectionCollapsed('card-dod')).toBe(false)
  })

  /** A column and a section could otherwise collide on a shared key space. */
  it('keeps card sections and collapsed columns apart', () => {
    useBoardStore.getState().toggleCardSectionCollapsed('board-1:todo')
    expect(useBoardStore.getState().isColumnCollapsed('board-1', 'todo')).toBe(false)
  })
})
