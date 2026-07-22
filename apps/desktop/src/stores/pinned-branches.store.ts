import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PinnedBranchesState {
  /**
   * Map repoPath -> (shortName -> explicit override).
   * `true` = explicitly pinned, `false` = explicitly unpinned.
   * An absent branch follows the default (main/master pinned).
   */
  overrides: Record<string, Record<string, boolean>>
  /** Sets a branch's explicit pinned state. */
  setPin: (repoPath: string, shortName: string, pinned: boolean) => void
}

export const usePinnedBranchesStore = create<PinnedBranchesState>()(
  persist(
    (set) => ({
      overrides: {},

      setPin: (repoPath, shortName, pinned) =>
        set((state) => ({
          overrides: {
            ...state.overrides,
            [repoPath]: { ...state.overrides[repoPath], [shortName]: pinned },
          },
        })),
    }),
    {
      name: 'git-manager-pinned-branches',
    }
  )
)
