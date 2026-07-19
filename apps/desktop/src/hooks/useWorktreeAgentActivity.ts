import useSWR from 'swr'
import type { WorktreeAgentActivity } from '@git-manager/git-types'
import { apiGetWorktreeAgentActivity } from '../api/worktree.api'

const EMPTY: WorktreeAgentActivity[] = []

/**
 * Live per-worktree AI-agent activity (Claude Code today) for the given worktree paths — powers the
 * agent logo shown inside a worktree's dashed "// WIP" ring in the commit graph and the
 * working/idle status tag next to it. Only worktrees with a recent session come back; the rest are
 * simply absent from the array.
 *
 * Polls faster than the WIP-status hook (3s vs 5s) because "working" is a short-lived, live state
 * worth catching promptly. The SWR key is the sorted, de-duplicated path set, so callers passing an
 * equivalent set share a single poll regardless of array identity/order.
 */
export function useWorktreeAgentActivity(paths: string[]): WorktreeAgentActivity[] {
  const unique = [...new Set(paths)].sort()
  const { data } = useSWR<WorktreeAgentActivity[], Error>(
    unique.length > 0 ? ['worktree-agent-activity', unique.join('|')] : null,
    () => apiGetWorktreeAgentActivity(unique),
    {
      refreshInterval: 3000,
      revalidateOnFocus: true,
    }
  )
  return data ?? EMPTY
}
