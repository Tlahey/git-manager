import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BoardState {
  /** Last active board id per repo path, so returning to a repo's Board tab restores where the user
   * left off rather than always landing on the first board. */
  activeBoardIdByRepo: Record<string, string>
  /** Collapsed column ids per board (`${boardId}:${columnId}` keys — flat rather than nested, so
   * `partialize` doesn't have to special-case an empty-object cleanup per board). */
  collapsedColumns: Record<string, true>
  /**
   * Collapsed sections of the card dialog, by section key.
   *
   * Per *section*, not per card: "I never look at the checklist" is a statement about the section,
   * and having to fold it again on every card opened would make the preference worthless.
   */
  collapsedCardSections: Record<string, true>
  setActiveBoard: (repoPath: string, boardId: string) => void
  toggleColumnCollapsed: (boardId: string, columnId: string) => void
  isColumnCollapsed: (boardId: string, columnId: string) => boolean
  toggleCardSectionCollapsed: (section: string) => void
  isCardSectionCollapsed: (section: string) => boolean
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      activeBoardIdByRepo: {},
      collapsedColumns: {},
      collapsedCardSections: {},

      setActiveBoard: (repoPath, boardId) =>
        set((state) => ({
          activeBoardIdByRepo: { ...state.activeBoardIdByRepo, [repoPath]: boardId },
        })),

      toggleColumnCollapsed: (boardId, columnId) =>
        set((state) => {
          const key = `${boardId}:${columnId}`
          const next = { ...state.collapsedColumns }
          if (next[key]) {
            delete next[key]
          } else {
            next[key] = true
          }
          return { collapsedColumns: next }
        }),

      isColumnCollapsed: (boardId, columnId) => Boolean(get().collapsedColumns[`${boardId}:${columnId}`]),

      toggleCardSectionCollapsed: (section) =>
        set((state) => {
          const next = { ...state.collapsedCardSections }
          if (next[section]) {
            delete next[section]
          } else {
            next[section] = true
          }
          return { collapsedCardSections: next }
        }),

      isCardSectionCollapsed: (section) => Boolean(get().collapsedCardSections[section]),
    }),
    {
      name: 'git-manager-board',
      partialize: (state) => ({
        activeBoardIdByRepo: state.activeBoardIdByRepo,
        collapsedColumns: state.collapsedColumns,
        collapsedCardSections: state.collapsedCardSections,
      }),
    }
  )
)
