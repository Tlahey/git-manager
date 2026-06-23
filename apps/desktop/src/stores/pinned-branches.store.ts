import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PinnedBranchesState {
  /**
   * Map repoPath -> (shortName -> override explicite).
   * `true` = épinglée explicitement, `false` = désépinglée explicitement.
   * Une branche absente suit la valeur par défaut (main/master épinglées).
   */
  overrides: Record<string, Record<string, boolean>>
  /** Fixe l'état épinglé explicite d'une branche. */
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
            [repoPath]: { ...(state.overrides[repoPath] ?? {}), [shortName]: pinned },
          },
        })),
    }),
    {
      name: 'git-manager-pinned-branches',
    }
  )
)
