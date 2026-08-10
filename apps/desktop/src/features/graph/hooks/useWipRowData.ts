import { useMemo } from 'react'
import { useGitStatus } from '../../../hooks/useGitStatus'
import { useWorktreeWipStatuses } from './useWorktreeWipStatuses'
import { useWorktreeAgentActivity } from './useWorktreeAgentActivity'

/**
 * Everything the graph's `// WIP` rows are built from: the working tree's status, the per-kind
 * counts the row displays, the other linked worktrees that also have uncommitted work, and the AI
 * agents running in any of them.
 *
 * They travel together because they answer one question — what is uncommitted, and where — and
 * because the last of them depends on the second-to-last: only a worktree that actually carries a
 * WIP row can surface an agent, so the activity query asks about exactly those paths and no others.
 */
export function useWipRowData(repoPath: string) {
  const { data: status } = useGitStatus(repoPath)

  const totalChanges = useMemo(() => {
    if (!status) return 0
    return (
      (status.staged?.length || 0) +
      (status.unstaged?.length || 0) +
      (status.untracked?.length || 0) +
      (status.conflicted?.length || 0)
    )
  }, [status])

  /**
   * The three counts the WIP row shows. Untracked files count as added and conflicted ones as
   * modified, since that is what they are from the row's point of view — a file that is new to the
   * repository, and one that needs work before it can be committed.
   */
  const wipStats = useMemo(() => {
    if (!status) return { added: 0, modified: 0, deleted: 0 }
    let added = status.untracked?.length || 0
    let modified = status.conflicted?.length || 0
    let deleted = 0
    for (const entry of [...(status.staged || []), ...(status.unstaged || [])]) {
      if (entry.status === 'added') added++
      else if (entry.status === 'deleted') deleted++
      else modified++
    }
    return { added, modified, deleted }
  }, [status])

  // WIP status of every OTHER linked worktree with uncommitted changes — lets several "// WIP"
  // rows coexist on different branches at once (see useGitGraphNodes' worktreeWipNodes).
  const { data: worktreeWipStatuses = [] } = useWorktreeWipStatuses(repoPath)

  // Live AI-agent activity for the active repo plus every linked worktree with a WIP row — drives
  // the agent logo in the dashed ring and the working/idle status tag.
  const agentActivityPaths = useMemo(
    () => [repoPath, ...worktreeWipStatuses.map((w) => w.path)],
    [repoPath, worktreeWipStatuses]
  )
  const worktreeAgentActivity = useWorktreeAgentActivity(agentActivityPaths)
  const wipAgentActivity = useMemo(
    () => worktreeAgentActivity.find((a) => a.path === repoPath),
    [worktreeAgentActivity, repoPath]
  )

  return {
    status,
    totalChanges,
    wipStats,
    worktreeWipStatuses,
    worktreeAgentActivity,
    wipAgentActivity,
  }
}
