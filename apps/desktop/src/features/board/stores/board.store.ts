import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createConfigStorage } from '../../../lib/appConfig/configStorage'

interface BoardState {
  /** Last active board id per repo path, so returning to a repo's Board tab restores where the user
   * left off rather than always landing on the first board. */
  activeBoardIdByRepo: Record<string, string>
  /**
   * Collapsed sections of the card dialog, by section key.
   *
   * Per *section*, not per card: "I never look at the checklist" is a statement about the section,
   * and having to fold it again on every card opened would make the preference worthless.
   */
  collapsedCardSections: Record<string, true>
  setActiveBoard: (repoPath: string, boardId: string) => void
  toggleCardSectionCollapsed: (section: string) => void
  isCardSectionCollapsed: (section: string) => boolean
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      activeBoardIdByRepo: {},
      collapsedCardSections: {},

      setActiveBoard: (repoPath, boardId) =>
        set((state) => ({
          activeBoardIdByRepo: { ...state.activeBoardIdByRepo, [repoPath]: boardId },
        })),

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
      // The `board` section of ~/.git-manager/settings.json — see lib/appConfig/.
      storage: createConfigStorage('board'),
      skipHydration: true,
      partialize: (state) => ({
        activeBoardIdByRepo: state.activeBoardIdByRepo,
        collapsedCardSections: state.collapsedCardSections,
      }),
    }
  )
)
