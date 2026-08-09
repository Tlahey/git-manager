import { GitBranch as BranchIcon, MoreVertical } from 'lucide-react'
import { highlightMatch } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import type { GitBranch } from '@git-manager/git-types'
import { useSingleOrDoubleClick } from '../../../hooks/useSingleOrDoubleClick'
import { HoverExpandLabel } from './HoverExpandLabel'
import { SoloToggle } from './SoloToggle'
import { VisibilityToggle } from './VisibilityToggle'
import { rowIndent } from './rowIndent'

interface RemoteBranchItemProps {
  branch: GitBranch
  /** Name shown on the row: the remote and every folder above it are stripped. */
  displayName: string
  /** Folders above it inside the remote node — 1 for a direct child of the remote. */
  depth: number
  isSelected: boolean
  /** Single click: highlights the branch. */
  onSelect: (name: string) => void
  /** Single click, alongside `onSelect` — focuses the branch's tip commit in the content view. */
  onFocus?: (branch: GitBranch) => void
  /** Double click: switches to the branch. */
  onCheckout?: (branch: GitBranch) => void
  /** Opens the branch's action menu (right-click on the row, or its "…" button). */
  onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
  /** Whether this branch's badge is currently kept out of the graph. */
  isHidden?: boolean
  onToggleVisibility?: (branchNames: string[], hidden: boolean) => void
  filterQuery?: string
  soloActive?: boolean
  isSoloed?: boolean
  onToggleSolo?: (name: string) => void
}

/**
 * One remote branch in the sidebar.
 *
 * Named the remote-qualified way throughout (`origin/build/ci`): that is how the graph names a
 * remote ref, so the hidden list, the solo set and the menu all have to agree on it. `shortName`
 * has the remote stripped by the backend and would name a different branch on another remote.
 */
export function RemoteBranchItem({
  branch,
  displayName,
  depth,
  isSelected,
  onSelect,
  onFocus,
  onCheckout,
  onContextMenu,
  isHidden = false,
  onToggleVisibility,
  filterQuery = '',
  soloActive = false,
  isSoloed = false,
  onToggleSolo,
}: RemoteBranchItemProps) {
  const { t } = useTranslation('git')
  const qualifiedName = branch.name
  const dimmed = soloActive && !isSoloed
  const visibilityLabel = isHidden
    ? t('sidebar.remote.showInGraph')
    : t('sidebar.remote.hideInGraph')

  // Held until the double click has had its chance: the DOM fires `click` on the first half of one,
  // so moving the view straight away would happen on the way to every checkout.
  const { handleClick, handleDoubleClick } = useSingleOrDoubleClick(
    () => {
      onSelect(branch.name)
      onFocus?.(branch)
    },
    () => onCheckout?.(branch)
  )

  /** True for a click that landed on one of the row's own buttons, which owns it. */
  const onOwnControl = (e: React.MouseEvent | React.KeyboardEvent) =>
    !!(e.target as HTMLElement).closest('[data-toggle]')

  return (
    <div
      style={{ paddingLeft: rowIndent(depth) }}
      className={`group/rbranch relative flex cursor-pointer items-center gap-1.5 py-[3px] pr-2 text-xs transition-colors ${
        isSelected
          ? 'bg-sidebar-accent text-sidebar-foreground'
          : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
      } ${dimmed || isHidden ? 'opacity-50' : ''}`}
      onClick={(e) => {
        if (onOwnControl(e)) return
        handleClick()
      }}
      // Switching branches is the one destructive-ish thing a row can do, so it takes the
      // deliberate gesture; a single click only moves the view.
      onDoubleClick={(e) => {
        if (onOwnControl(e)) return
        handleDoubleClick()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(e, branch)
      }}
      role="button"
      tabIndex={0}
      // No double-tap on a keyboard: Enter is the plain select, with no delay to wait out.
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || onOwnControl(e)) return
        onSelect(branch.name)
        onFocus?.(branch)
      }}
    >
      {/* Solo mode owns the left edge while it is on — the two eyes would sit on top of each
          other, and solo is the stronger, temporary statement about what the graph shows. */}
      {soloActive && onToggleSolo ? (
        <SoloToggle isSoloed={isSoloed} onToggle={() => onToggleSolo(qualifiedName)} />
      ) : (
        <VisibilityToggle
          isHidden={isHidden}
          onToggle={() => onToggleVisibility?.([qualifiedName], !isHidden)}
          label={visibilityLabel}
          dataToggle="remote-visibility"
          hoverClass="group-hover/rbranch:opacity-100"
        />
      )}
      <BranchIcon className="h-3 w-3 shrink-0 opacity-30" />
      <HoverExpandLabel>{highlightMatch(displayName, filterQuery)}</HoverExpandLabel>
      {(branch.aheadCount > 0 || branch.behindCount > 0) && (
        <span className="shrink-0 text-[10px] tabular-nums">
          {branch.aheadCount > 0 && <span className="text-blue-400">↑{branch.aheadCount}</span>}
          {branch.behindCount > 0 && (
            <span className="ml-0.5 text-orange-400">↓{branch.behindCount}</span>
          )}
        </span>
      )}
      {/* Same actions as the row's right-click, reachable by pointing — it opens the very same
          menu spec rather than a second, forkable definition of it. */}
      <button
        data-toggle="remote-branch-actions"
        onClick={(e) => {
          e.stopPropagation()
          onContextMenu?.(e, branch)
        }}
        className="shrink-0 rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-foreground group-hover/rbranch:opacity-100"
        aria-label={t('sidebar.branchActions')}
        title={t('sidebar.branchActions')}
        data-testid={`remote-branch-actions-${qualifiedName}`}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
