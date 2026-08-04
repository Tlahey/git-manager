import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settings.store'
import {
  apiGetRepoStatus,
  apiStageFile,
  apiCreateCommit,
  apiPushBranch,
  apiGetBranches,
} from '../api/git.api'

const BOARD_CONFIG_PATH = '.git-manager/board.json'
const SYNC_COMMIT_MESSAGE = 'chore(board): sync board config'

/** Best-effort: a failed sync just tries again next interval, and must never surface as an error the
 * user has to handle — this runs silently in the background regardless of what page is open. */
async function syncIfDirty(repoPath: string) {
  try {
    const status = await apiGetRepoStatus(repoPath)
    const isDirty =
      status.staged.some((e) => e.path === BOARD_CONFIG_PATH) ||
      status.unstaged.some((e) => e.path === BOARD_CONFIG_PATH) ||
      status.untracked.includes(BOARD_CONFIG_PATH)
    if (!isDirty) return

    await apiStageFile(repoPath, BOARD_CONFIG_PATH)
    await apiCreateCommit(repoPath, SYNC_COMMIT_MESSAGE)

    const branches = await apiGetBranches(repoPath, false)
    const hasUpstream = branches.some((b) => b.isHead && b.upstream)
    if (hasUpstream) {
      await apiPushBranch(repoPath)
    }
  } catch {
    // Swallowed — see doc comment above.
  }
}

/**
 * Periodically commits (and pushes, if the checked-out branch has an upstream) a remote board's
 * `.git-manager/board.json` when it's dirty — see `BoardSettings`'s doc comment for why this is
 * opt-in and off by default. Mounted once per open repo tab (`RepoView`), independent of whether the
 * Board panel itself is visible, so structural edits made just before switching away still sync.
 */
export function useBoardConfigAutoSync(repoPath: string | null) {
  const enabled = useSettingsStore((s) => s.settings.board?.autoSync.enabled ?? false)
  const intervalMinutes = useSettingsStore((s) => s.settings.board?.autoSync.intervalMinutes ?? 5)

  useEffect(() => {
    if (!repoPath || !enabled) return
    const intervalMs = Math.max(1, intervalMinutes) * 60_000
    const id = setInterval(() => void syncIfDirty(repoPath), intervalMs)
    return () => clearInterval(id)
  }, [repoPath, enabled, intervalMinutes])
}
