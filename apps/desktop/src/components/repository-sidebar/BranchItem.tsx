import { GitBranch as BranchIcon, MoreHorizontal, Pin } from 'lucide-react'
import type { GitBranch } from '@git-manager/git-types'
import { HoverExpandLabel } from './HoverExpandLabel'

interface BranchItemProps {
  branch: GitBranch
  isSelected: boolean
  depth?: 0 | 1
  isPinned?: boolean
  canPin?: boolean
  onSelect: (name: string) => void
  onTogglePin?: (shortName: string) => void
  onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
}

export function BranchItem({
  branch,
  isSelected,
  depth = 0,
  isPinned = false,
  canPin = true,
  onSelect,
  onTogglePin,
  onContextMenu,
}: BranchItemProps) {
  const paddingLeft = depth === 1 ? 'pl-10' : 'pl-6'

  return (
    <div
      className={`group/branch relative flex items-center gap-1.5 py-[3px] pr-1 text-xs transition-colors ${paddingLeft} ${
        isSelected
          ? 'bg-sidebar-accent text-sidebar-foreground'
          : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
      }`}
      onClick={() => onSelect(branch.shortName)}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, branch) : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(branch.shortName)}
    >
      {/* Icône branche */}
      <BranchIcon className="h-3 w-3 shrink-0 opacity-40" />

      {/* Nom de la branche — hover-expand robuste (overlay fixed) */}
      <HoverExpandLabel className={branch.isHead ? 'font-medium text-sidebar-foreground' : ''}>
        {branch.isHead && <span className="mr-1 text-[10px] text-emerald-400">●</span>}
        {branch.shortName}
      </HoverExpandLabel>

      {/* Ahead / Behind — toujours affiché (push/pull) */}
      {(branch.aheadCount > 0 || branch.behindCount > 0) && (
        <span className="shrink-0 text-[10px] tabular-nums">
          {branch.aheadCount > 0 && <span className="text-blue-400">↑{branch.aheadCount}</span>}
          {branch.behindCount > 0 && (
            <span className="ml-0.5 text-orange-400">↓{branch.behindCount}</span>
          )}
        </span>
      )}

      {/* Bouton pin / unpin — toujours visible si épinglé, sinon au survol */}
      {canPin && onTogglePin && (
        <button
          className={`shrink-0 rounded p-0.5 transition-colors hover:bg-sidebar-accent ${
            isPinned ? 'text-sidebar-muted-foreground/70' : 'hidden group-hover/branch:inline-flex'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin(branch.shortName)
          }}
          aria-label={isPinned ? `Désépingler ${branch.shortName}` : `Épingler ${branch.shortName}`}
          title={isPinned ? 'Désépingler' : 'Épingler en haut'}
        >
          {isPinned ? <Pin className="h-3 w-3 fill-current" /> : <Pin className="h-3 w-3" />}
        </button>
      )}

      {/* Bouton ⋮ contexte — au survol */}
      <button
        className="hidden shrink-0 rounded p-0.5 transition-colors hover:bg-sidebar-accent group-hover/branch:inline-flex"
        onClick={(e) => {
          e.stopPropagation()
          onContextMenu?.(e as unknown as React.MouseEvent, branch)
        }}
        aria-label={`Actions pour ${branch.shortName}`}
      >
        <MoreHorizontal className="h-3 w-3" />
      </button>
    </div>
  )
}
