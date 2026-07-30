import {
  Archive,
  FilePlus2,
  FolderGit2,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  History,
  RefreshCcw,
} from 'lucide-react'
import type { GitCommandFamily } from '../../../lib/gitCommandCatalog'

/**
 * One icon per operation family, so a journal row is identifiable before it is read.
 *
 * A module-level map of components rather than a switch inside the row: the row renders one of these
 * per line and per action, and this keeps the choice a lookup. Colour comes with it, because the point
 * of the icon is to make "this touched the remote" and "this rewrote history" distinguishable at a
 * glance — history is the warning tone deliberately, since that is the family whose commands are the
 * ones a user needs to notice.
 */
const FAMILY_ICONS: Record<GitCommandFamily, { Icon: typeof GitBranch; className: string }> = {
  staging: { Icon: FilePlus2, className: 'text-tone-info' },
  commit: { Icon: GitCommitHorizontal, className: 'text-tone-success' },
  branch: { Icon: GitBranch, className: 'text-primary' },
  history: { Icon: History, className: 'text-tone-warning' },
  remote: { Icon: RefreshCcw, className: 'text-tone-info' },
  stash: { Icon: Archive, className: 'text-muted-foreground' },
  worktree: { Icon: FolderTree, className: 'text-muted-foreground' },
  conflict: { Icon: GitMerge, className: 'text-tone-warning' },
  repo: { Icon: FolderGit2, className: 'text-muted-foreground' },
}

/** The icon for an operation family, sized for a journal row. */
export function ActionFamilyIcon({
  family,
  className = 'h-3.5 w-3.5',
}: {
  family: GitCommandFamily
  className?: string
}) {
  const { Icon, className: tone } = FAMILY_ICONS[family]
  return <Icon className={`${className} shrink-0 ${tone}`} aria-hidden="true" />
}
