import { GitBranch as BranchIcon, MoreVertical, Pin } from 'lucide-react'
import { highlightMatch } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import { useSingleOrDoubleClick } from '../../../hooks/useSingleOrDoubleClick'
import type { GitBranch } from '@git-manager/git-types'
import { HoverExpandLabel } from './HoverExpandLabel'
import { SoloToggle } from './SoloToggle'

interface BranchItemProps {
  branch: GitBranch
  /** Displayed name — defaults to the full short name (the caller strips any folder prefix). */
  displayName?: string
  isSelected: boolean
  /** Folders above the branch in its section — drives the row's indent, at any depth. */
  depth?: number
  isPinned?: boolean
  canPin?: boolean
  /** Single click: highlights the branch and brings it into view in the graph. */
  onSelect: (name: string) => void
  /** Single click, alongside `onSelect` — focuses the branch's tip commit in the content view. */
  onFocus?: (branch: GitBranch) => void
  /** Double click: switches to the branch. */
  onCheckout?: (branch: GitBranch) => void
  onTogglePin?: (shortName: string) => void
  onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
  /** Active sidebar search query — matched substrings are highlighted in the branch name. */
  filterQuery?: string
  /** Solo mode on: show the eye/eye-off toggle and dim the row when this branch is hidden. */
  soloActive?: boolean
  /** Whether this branch is soloed (visible in the graph). */
  isSoloed?: boolean
  /** Whether the branch's badge is kept out of the graph (its menu's Hide entry) — dims the row. */
  isHidden?: boolean
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
  onFocus,
  onCheckout,
  onTogglePin,
  onContextMenu,
  filterQuery = '',
  soloActive = false,
  isSoloed = false,
  isHidden = false,
  onToggleSolo,
}: BranchItemProps) {
  const { t } = useTranslation('git')
  // In solo mode a hidden (non-soloed) branch is dimmed so the visible set stands out.
  const dimmed = soloActive && !isSoloed
  // Held until the double click has had its chance: the DOM fires `click` on the first half of one,
  // so moving the view straight away would happen on the way to every checkout.
  const { handleClick, handleDoubleClick } = useSingleOrDoubleClick(
    () => {
      onSelect(branch.shortName)
      onFocus?.(branch)
    },
    () => onCheckout?.(branch)
  )

  return (
    <div
      style={{ paddingLeft: `${1.5 + depth}rem` }}
      className={`group/branch relative flex cursor-pointer items-center gap-1.5 py-[3px] pr-1 text-xs transition-colors ${
        isSelected
          ? 'bg-sidebar-accent text-sidebar-foreground'
          : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
      } ${dimmed || isHidden ? 'opacity-50' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-toggle]')) return
        handleClick()
      }}
      // Switching branches is the one destructive-ish thing a row can do, so it takes the
      // deliberate gesture; a single click only moves the view.
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-toggle]')) return
        handleDoubleClick()
      }}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, branch) : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        onSelect(branch.shortName)
        onFocus?.(branch)
      }}
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

      {/* Pin / unpin — always visible once pinned, on hover otherwise */}
      {canPin && onTogglePin && (
        <button
          className={`shrink-0 cursor-pointer rounded p-0.5 transition-colors hover:bg-sidebar-accent ${
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
          title={
            isPinned
              ? t('sidebar.branch.unpin', { branch: branch.shortName })
              : t('sidebar.branch.pin')
          }
          data-testid={`branch-pin-${branch.shortName}`}
        >
          {isPinned ? <Pin className="h-3 w-3 fill-current" /> : <Pin className="h-3 w-3" />}
        </button>
      )}

      {/* Same actions as the row's right-click, reachable by pointing — it opens the very same
          menu spec rather than a second, forkable definition of it. */}
      <button
        data-toggle="branch-actions"
        className="shrink-0 cursor-pointer rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all group-hover/branch:opacity-100 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
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
