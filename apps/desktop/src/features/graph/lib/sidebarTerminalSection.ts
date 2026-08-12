import type { GitWorktree, TerminalStatus } from '@git-manager/git-types'
import type { TerminalSession } from '../../../stores/terminal.store'
import { terminalLocationLabel } from '../../../lib/terminalLocation'
import type { SidebarRow, SidebarSection } from '../sidebar/types'
import type { SidebarSectionContext } from './sidebarGithubSections'

/**
 * The Terminals section: this repository's live shell sessions, wherever they were opened.
 *
 * It exists because a session outlives the view it was started from (see `terminal.store.ts`), and
 * something has to say where they all are — the panel's tab strip is only visible while the panel
 * is, and the running agent you want back is usually the reason you'd open it. Each row names the
 * worktree it is bound to, so the list doubles as a way *into* those worktrees.
 *
 * Only sessions belonging to this repository are listed. A terminal opened on another repo's tab is
 * still alive and still in the panel's strip; it simply has nothing to do with this sidebar, and
 * would offer a click that switched to a worktree this repo does not have.
 */

interface TerminalsSectionData {
  sessions: TerminalSession[]
  activity: Record<string, TerminalStatus>
  /** Every worktree of the repo, main included — both the ownership test and the row labels. */
  worktrees: GitWorktree[]
  /** The repo tab's own path, in case the worktree list has not arrived yet. */
  repoPath: string
  /** The session the panel is currently showing, highlighted in the list. */
  activeId: string | null
}

/** Sessions bound to a directory this repository owns, running ones first. */
export function repoTerminalSessions({
  sessions,
  activity,
  worktrees,
  repoPath,
}: Omit<TerminalsSectionData, 'activeId'>): TerminalSession[] {
  const owned = new Set([repoPath, ...worktrees.map((wt) => wt.path)])
  return sessions
    .filter((session) => owned.has(session.cwd))
    .sort((a, b) => Number(activity[b.id]?.busy ?? false) - Number(activity[a.id]?.busy ?? false))
}

export function buildTerminalsSection(
  { t, q, isOpen }: SidebarSectionContext,
  { sessions, activity, worktrees, repoPath, activeId }: TerminalsSectionData
): SidebarSection | null {
  const owned = repoTerminalSessions({ sessions, activity, worktrees, repoPath })

  const query = q.trim().toLowerCase()
  const labelled = owned.map((session) => ({
    session,
    location: terminalLocationLabel(session.cwd, worktrees),
    status: activity[session.id],
  }))
  const matching = labelled.filter(
    ({ session, location, status }) =>
      !query ||
      location.toLowerCase().includes(query) ||
      session.title.toLowerCase().includes(query) ||
      (status?.command ?? '').toLowerCase().includes(query)
  )

  // Like Local and Worktrees, the section survives being empty — a repo with no terminal open is
  // the normal case, and hiding it would take the list away exactly when a user goes looking for
  // it. A search that matches nothing does hide it, which is the shared rule (see
  // `sidebarGitSections.ts`).
  if (query && matching.length === 0) return null

  const rows: SidebarRow[] = []
  if (isOpen) {
    if (matching.length === 0) {
      rows.push({ kind: 'message', id: 'term:empty', text: t('sidebar.terminals.empty') })
    } else {
      for (const { session, location, status } of matching) {
        rows.push({
          kind: 'terminal',
          id: `term:${session.id}`,
          session,
          location,
          isActive: session.id === activeId,
          isBusy: status?.busy ?? false,
          command: status?.command ?? null,
        })
      }
    }
  }

  return {
    key: 'terminals',
    title: 'Terminals',
    count: matching.length || undefined,
    isOpen,
    rows,
  }
}
