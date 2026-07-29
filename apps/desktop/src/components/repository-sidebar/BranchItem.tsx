import { GitBranch as BranchIcon, MoreVertical, Pin } from 'lucide-react'
import { highlightMatch } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import type { GitBranch, PullRequest } from '@git-manager/git-types'
import { HoverExpandLabel } from './HoverExpandLabel'
import { SoloToggle } from './SoloToggle'
import { PrStatusTag } from './PrStatusTag'

interface BranchItemProps {
  branch: GitBranch
  /** Displayed name — defaults to the full short name (the caller strips any folder prefix). */
  displayName?: string
  isSelected: boolean
  /** Folders above the branch in its section — drives the row's indent, at any depth. */
  depth?: number
  isPinned?: boolean
  canPin?: boolean
  onSelect: (name: string) => void
  onTogglePin?: (shortName: string) => void
  onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
  /** PR linked to this branch (headRef == shortName), if any — shown as a status tag on the right. */
  pr?: PullRequest
  /** Opens the linked PR when its tag is clicked. */
  onOpenPr?: (pr: PullRequest) => void
  /** Active sidebar search query — matched substrings are highlighted in the branch name. */
  filterQuery?: string
  /** Solo mode on: show the eye/eye-off toggle and dim the row when this branch is hidden. */
  soloActive?: boolean
  /** Whether this branch is soloed (visible in the graph). */
  isSoloed?: boolean
  /** Toggle this branch's solo status by shortName. */
  onToggleSolo?: (shortName: string) => void
}

export function BranchItem({
  branch,
  displayName = branch.shortName,
  isSelected,
  depth = 0,
  isPinned = false,
  canPin = true,
  onSelect,
  onTogglePin,
  onContextMenu,
  pr,
  onOpenPr,
  filterQuery = '',
  soloActive = false,
  isSoloed = false,
  onToggleSolo,
}: BranchItemProps) {
  const { t } = useTranslation('git')
  // In solo mode a hidden (non-soloed) branch is dimmed so the visible set stands out.
  const dimmed = soloActive && !isSoloed

  return (
    <div
      style={{ paddingLeft: `${1.5 + depth}rem` }}
      className={`group/branch relative flex items-center gap-1.5 py-[3px] pr-1 text-xs transition-colors ${
        isSelected
          ? 'bg-sidebar-accent text-sidebar-foreground'
          : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
      } ${dimmed ? 'opacity-50' : ''}`}
      onClick={() => onSelect(branch.shortName)}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, branch) : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(branch.shortName)}
    >
      {soloActive && onToggleSolo && (
        <SoloToggle isSoloed={isSoloed} onToggle={() => onToggleSolo(branch.shortName)} />
      )}

      {/* Branch icon */}
      <BranchIcon className="h-3 w-3 shrink-0 opacity-40" />

      {/* Branch name — hover-expands into a fixed overlay when it overflows */}
      <HoverExpandLabel className={branch.isHead ? 'font-medium text-sidebar-foreground' : ''}>
        {branch.isHead && <span className="mr-1 text-[10px] text-emerald-400">●</span>}
        {highlightMatch(displayName, filterQuery)}
      </HoverExpandLabel>

      {/* Ahead / behind — always shown (push/pull) */}
      {(branch.aheadCount > 0 || branch.behindCount > 0) && (
        <span className="shrink-0 text-[10px] tabular-nums">
          {branch.aheadCount > 0 && <span className="text-blue-400">↑{branch.aheadCount}</span>}
          {branch.behindCount > 0 && (
            <span className="ml-0.5 text-orange-400">↓{branch.behindCount}</span>
          )}
        </span>
      )}

      {/* PR tag — always visible when the branch is linked to a pull request */}
      {pr && <PrStatusTag pr={pr} onOpen={onOpenPr} />}

      {/* Pin / unpin — always visible once pinned, on hover otherwise */}
      {canPin && onTogglePin && (
        <button
          className={`shrink-0 rounded p-0.5 transition-colors hover:bg-sidebar-accent ${
            isPinned ? 'text-sidebar-muted-foreground/70' : 'hidden group-hover/branch:inline-flex'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin(branch.shortName)
          }}
          aria-label={
            isPinned
              ? t('sidebar.branch.unpin', { branch: branch.shortName })
              : t('sidebar.branch.pinBranch', { branch: branch.shortName })
          }
          title={isPinned ? t('sidebar.branch.unpin', { branch: branch.shortName }) : t('sidebar.branch.pin')}
        >
          {isPinned ? <Pin className="h-3 w-3 fill-current" /> : <Pin className="h-3 w-3" />}
        </button>
      )}

      {/* Same actions as the row's right-click, reachable by pointing — it opens the very same
          menu spec rather than a second, forkable definition of it. */}
      <button
        data-toggle="branch-actions"
        className="shrink-0 rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-foreground group-hover/branch:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          onContextMenu?.(e, branch)
        }}
        aria-label={t('sidebar.branchActions')}
        title={t('sidebar.branchActions')}
        data-testid={`branch-actions-${branch.shortName}`}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
