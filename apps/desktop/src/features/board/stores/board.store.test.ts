import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardStore } from './board.store'

beforeEach(() => {
  useBoardStore.setState({ activeBoardIdByRepo: {}, collapsedCardSections: {} })
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

  /** Per section, not per card: folding the checklist again on every card opened would make the
   * preference worthless. */
  it('folds a card-dialog section for every card at once', () => {
    useBoardStore.getState().toggleCardSectionCollapsed('card-dod')
    expect(useBoardStore.getState().isCardSectionCollapsed('card-dod')).toBe(true)
    expect(useBoardStore.getState().isCardSectionCollapsed('card-description')).toBe(false)

    useBoardStore.getState().toggleCardSectionCollapsed('card-dod')
    expect(useBoardStore.getState().isCardSectionCollapsed('card-dod')).toBe(false)
  })
})
