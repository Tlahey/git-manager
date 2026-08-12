import { useState } from 'react'
import {
  Layers,
  Lock,
  MoreVertical,
  Copy,
  Hash,
  FilePlus,
  FilePen,
  FileMinus,
  FolderOpen,
  ExternalLink,
  Trash2,
  GitBranch as BranchIcon,
} from 'lucide-react'
import {
  Tag,
  Tooltip,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@git-manager/ui'
import { highlightMatch } from '@git-manager/components'
import type { GitWorktree } from '@git-manager/git-types'
import { useTranslation } from '@git-manager/i18n'
import { copyWithToast } from '../../../lib/clipboard'
import { useOpenRepoTab } from '../../../hooks/useOpenRepoTab'
import type { WorktreeWipStatus } from '../hooks/useWorktreeWipStatuses'
import type { WorktreeTerminalSummary } from '../lib/worktreeTerminals'
import { TerminalStateIcon } from '../../../components/terminal/TerminalStateIcon'
import { HoverExpandLabel } from './HoverExpandLabel'

interface WorktreeItemProps {
  wt: GitWorktree
  /** Pending-changes breakdown for this worktree, or undefined when it is clean. */
  wipStatus?: WorktreeWipStatus
  /** Live terminal sessions bound to this worktree, or undefined when none is open. */
  terminals?: WorktreeTerminalSummary
  filterQuery?: string
  onOpenWorktree?: (wt: GitWorktree) => void
  onRemoveWorktree?: (wt: GitWorktree) => void
  /** Remove the worktree *and* delete the branch it had checked out. */
  onRemoveWorktreeAndBranch?: (wt: GitWorktree) => void
  /** Enters this worktree and shows the session named by `terminals.sessionId`. */
  onFocusTerminal?: (sessionId: string, cwd: string) => void
}

/**
 * The badge's tooltip and its accessible name, which are the same sentence — the glyph carries no
 * text of its own, so this is the only thing that announces it.
 *
 * Three shapes rather than one, because the three states are about different things: what is
 * running, what has just finished, or simply how many shells are open here.
 */
function terminalBadgeLabel(
  t: ReturnType<typeof useTranslation<'git'>>['t'],
  terminals: WorktreeTerminalSummary
): string {
  const { state, command, count } = terminals
  if (state === 'idle') return t('sidebar.worktree.terminalOpen', { count })
  if (state === 'busy') {
    return command
      ? t('sidebar.worktree.terminalRunning', { command })
      : t('sidebar.worktree.terminalRunningUnnamed')
  }
  return command
    ? t('sidebar.worktree.terminalFinished', { command })
    : t('sidebar.worktree.terminalFinishedUnnamed')
}

/**
 * One linked worktree in the sidebar.
 *
 * The row deliberately shows only the branch name: the folder it lives in is the kind of detail you
 * want on demand, not permanently taking up a narrow row, so it surfaces in the hover card instead.
 *
 * The terminal badge is the exception to that restraint, and it earns its place at the head of the
 * row: whether something is running here is otherwise only knowable by entering each worktree in
 * turn. Clicking it goes there *and* puts that terminal on screen — the row's own double-click only
 * does the first half.
 */
export function WorktreeItem({
  wt,
  wipStatus,
  terminals,
  filterQuery = '',
  onOpenWorktree,
  onRemoveWorktree,
  onRemoveWorktreeAndBranch,
  onFocusTerminal,
}: WorktreeItemProps) {
  const { t } = useTranslation('git')
  const openRepoTab = useOpenRepoTab()
  // The pending-changes dot and the terminal badge sit inside the row, so entering either also
  // enters the row. Tracking it lets the row's own tooltip stand down while the more specific one
  // is the relevant one.
  const [dotHovered, setDotHovered] = useState(false)

  const terminalLabel = terminals ? terminalBadgeLabel(t, terminals) : ''

  return (
    <Tooltip
      // Below the row, flipping above on its own when the row sits near the bottom of the panel.
      placement="bottom"
      delay={400}
      // The pending-changes dot carries its own tooltip; without this the two would stack up on
      // top of each other the moment the pointer reached it.
      disabled={dotHovered}
      className="max-w-none px-3 py-2"
      content={
        <div className="max-w-xs whitespace-normal" data-testid={`worktree-hover-card-${wt.path}`}>
          <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
            {t('sidebar.worktree.workingDirectory')}
          </div>
          <div className="mt-0.5 font-mono text-[11px] break-all text-foreground">{wt.path}</div>
        </div>
      }
    >
      <div
        data-testid={`worktree-item-${wt.path}`}
        onDoubleClick={() => onOpenWorktree?.(wt)}
        className="group/wt relative flex cursor-pointer items-center gap-1.5 py-[3px] pr-6 pl-6 text-xs text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      >
        {/* Ahead of the worktree glyph, not tucked in at the end of the row: a row is scanned from
            its left edge, and "something is running here" is the one thing on it worth finding
            without reading the branch name first. It sits in the row's own indent gutter (nothing
            else claims it on a worktree row) and stays a fixed-width glyph — naming the command
            here would move every branch label right by however long that name happened to be, so
            the name is left to the tooltip, to the accessible label, and to the Terminals section. */}
        {terminals && (
          <Tooltip delay={0} placement="top" content={terminalLabel}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onFocusTerminal?.(terminals.sessionId, wt.path)
              }}
              onMouseEnter={() => setDotHovered(true)}
              onMouseLeave={() => setDotHovered(false)}
              className="-ml-4 flex shrink-0 cursor-pointer items-center rounded hover:bg-sidebar-accent/80"
              data-testid={`worktree-terminal-badge-${wt.path}`}
              aria-label={terminalLabel}
            >
              <TerminalStateIcon state={terminals.state} size={2.5} className="px-0.5 py-px" />
            </button>
          </Tooltip>
        )}

        <Layers className="h-3 w-3 shrink-0 opacity-30" />
        <HoverExpandLabel className="min-w-0 flex-1 truncate font-medium">
          {wt.isLocked && <Lock className="mr-1 inline h-2.5 w-2.5 text-amber-400" />}
          {highlightMatch(wt.branch, filterQuery)}
        </HoverExpandLabel>

        {wipStatus && (
          <Tooltip
            delay={0}
            placement="top"
            content={
              <span className="flex items-center gap-1">
                <Tag tone="success" className="tabular-nums">
                  <FilePlus className="h-3 w-3" />
                  {wipStatus.added}
                </Tag>
                <Tag tone="warning" className="tabular-nums">
                  <FilePen className="h-3 w-3" />
                  {wipStatus.modified}
                </Tag>
                <Tag tone="danger" className="tabular-nums">
                  <FileMinus className="h-3 w-3" />
                  {wipStatus.deleted}
                </Tag>
              </span>
            }
          >
            {/* Deliberately a bare dot rather than a Tag: the row is narrow, and the counts it
                would spell out are one hover away in the tooltip. */}
            <span
              className="h-1.5 w-1.5 shrink-0 cursor-default rounded-full bg-amber-400"
              onMouseEnter={() => setDotHovered(true)}
              onMouseLeave={() => setDotHovered(false)}
              aria-label={t('sidebar.worktree.pendingChanges', { count: wipStatus.totalChanges })}
              data-testid={`worktree-changes-bubble-${wt.path}`}
            />
          </Tooltip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="absolute top-1/2 right-1 shrink-0 -translate-y-1/2 cursor-pointer rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all group-hover/wt:opacity-100 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground data-[state=open]:opacity-100"
              aria-label={t('sidebar.worktreeActions')}
              title={t('sidebar.worktreeActions')}
              data-testid={`worktree-actions-button-${wt.path}`}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => onOpenWorktree?.(wt)}
              className="gap-2 text-xs"
              data-testid={`worktree-open-${wt.path}`}
            >
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              {t('sidebar.worktree.openThis')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => openRepoTab(wt.path)}
              className="gap-2 text-xs"
              data-testid={`worktree-open-new-tab-${wt.path}`}
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              {t('sidebar.worktree.openInNewTab')}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={() => copyWithToast(wt.path, 'path')}
              className="gap-2 text-xs"
              data-testid={`worktree-copy-path-${wt.path}`}
            >
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              {t('sidebar.copyPath')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => copyWithToast(wt.commitOid, 'sha')}
              className="gap-2 text-xs"
              data-testid={`worktree-copy-sha-${wt.path}`}
            >
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              {t('sidebar.copySha')}
            </DropdownMenuItem>

            {(onRemoveWorktree || onRemoveWorktreeAndBranch) && <DropdownMenuSeparator />}

            {onRemoveWorktree && (
              <DropdownMenuItem
                onSelect={() => onRemoveWorktree(wt)}
                className="gap-2 text-xs text-destructive focus:text-destructive"
                data-testid={`worktree-remove-${wt.path}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('sidebar.worktree.removeThis')}
              </DropdownMenuItem>
            )}
            {onRemoveWorktreeAndBranch && (
              <DropdownMenuItem
                onSelect={() => onRemoveWorktreeAndBranch(wt)}
                className="gap-2 text-xs text-destructive focus:text-destructive"
                data-testid={`worktree-remove-with-branch-${wt.path}`}
              >
                <BranchIcon className="h-3.5 w-3.5" />
                {t('sidebar.worktree.removeAndDeleteBranch')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Tooltip>
  )
}
