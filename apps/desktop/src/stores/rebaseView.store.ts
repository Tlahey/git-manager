import { create } from 'zustand'

/** Which of the two rebase panels the user dismissed, for one repo. Absent flag = visible. */
interface RebaseViewFlags {
  /** The center step-rail view (`RebaseProgressCenter`). */
  progressHidden?: boolean
  /** The right-hand conflicted-files panel (`ConflictResolutionPanel`). */
  filesHidden?: boolean
}

/**
 * UI-only visibility of the two panels a running rebase claims: the progress view in the center
 * (where in the plan we are) and the conflicted-files panel on the right (what to fix).
 *
 * Both show themselves — a rebase starting is enough, no user action needed — so this store only
 * records the opposite choice, the panels the user dismissed. That's why the files panel needs a
 * flag at all: its visibility used to be *derived* from the CONFLICT row being the graph's
 * selection, which made it collateral damage of any click that toggled that selection off.
 *
 * Keyed by repo path (a rebase is per repo/worktree, and several tabs stay open at once), and
 * deliberately not persisted: a dismissal applies to the rebase in front of the user, not to
 * every future one — `reset` clears it as soon as the repo stops rebasing.
 */
interface RebaseViewState {
  views: Record<string, RebaseViewFlags>
  hideProgress: (repoPath: string) => void
  showProgress: (repoPath: string) => void
  hideFiles: (repoPath: string) => void
  showFiles: (repoPath: string) => void
  toggleFiles: (repoPath: string) => void
  /** Forgets the repo's dismissals, so the next rebase surfaces both panels again. */
  reset: (repoPath: string) => void
}

function patch(repoPath: string, flags: RebaseViewFlags) {
  return (s: RebaseViewState) => ({
    views: { ...s.views, [repoPath]: { ...s.views[repoPath], ...flags } },
  })
}

export const useRebaseViewStore = create<RebaseViewState>((set) => ({
  views: {},
  hideProgress: (repoPath) => set(patch(repoPath, { progressHidden: true })),
  showProgress: (repoPath) => set(patch(repoPath, { progressHidden: false })),
  hideFiles: (repoPath) => set(patch(repoPath, { filesHidden: true })),
  showFiles: (repoPath) => set(patch(repoPath, { filesHidden: false })),
  toggleFiles: (repoPath) =>
    set((s) => patch(repoPath, { filesHidden: !s.views[repoPath]?.filesHidden })(s)),
  reset: (repoPath) =>
    set((s) => {
      if (!(repoPath in s.views)) return s
      const { [repoPath]: _removed, ...rest } = s.views
      return { views: rest }
    }),
}))
