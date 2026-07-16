import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Globe,
  GitBranch as BranchIcon,
  Tag as TagIcon,
  Archive as ArchiveIcon,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Trash2,
  GitFork,
} from 'lucide-react'
import { Spinner } from '@git-manager/ui'
import { highlightMatch } from '@git-manager/components'
import type { GitBranch, GitWorktree, PullRequest, GitStash } from '@git-manager/git-types'
import type { SidebarRow } from './types'
import { BranchItem } from './BranchItem'
import { PullRequestItem } from './PullRequestItem'
import { HoverExpandLabel } from './HoverExpandLabel'

interface SidebarRowViewProps {
  row: SidebarRow
  onToggleOpen: (id: string) => void
  onSelectBranch: (name: string) => void
  onTogglePin: (shortName: string) => void
  onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
  onOpenPr?: (pr: PullRequest) => void
  onStashContextMenu?: (e: React.MouseEvent, stash: GitStash) => void
  hiddenStashes?: string[]
  onToggleStashVisibility?: (oid: string) => void
  onRemoveWorktree?: (wt: GitWorktree) => void
  /** Active sidebar search query — matched substrings are highlighted in the row's label(s). */
  filterQuery?: string
}

export function SidebarRowView({
  row,
  onToggleOpen,
  onSelectBranch,
  onTogglePin,
  onContextMenu,
  onOpenPr,
  onStashContextMenu,
  hiddenStashes = [],
  onToggleStashVisibility,
  onRemoveWorktree,
  filterQuery = '',
}: SidebarRowViewProps) {
  switch (row.kind) {
    case 'branch':
      return (
        <BranchItem
          branch={row.branch}
          displayName={row.displayName}
          isSelected={row.isSelected}
          depth={row.depth}
          isPinned={row.isPinned}
          onSelect={onSelectBranch}
          onTogglePin={onTogglePin}
          onContextMenu={onContextMenu}
          filterQuery={filterQuery}
        />
      )

    case 'folder':
      return (
        <button
          onClick={() => onToggleOpen(row.id)}
          className="flex w-full items-center gap-1.5 py-[3px] pl-4 pr-2 text-left text-xs text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
        >
          <span className="shrink-0">
            {row.isOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
          <FolderGit2 className="h-3 w-3 shrink-0 opacity-50" />
          <span className="flex-1 truncate font-medium">
            {row.hasHead && <span className="mr-1 text-[9px] text-emerald-400">●</span>}
            {row.prefix.replace(/\/$/, '')}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-sidebar-muted-foreground/40">
            {row.count}
          </span>
        </button>
      )

    case 'remote-group':
      return (
        <button
          onClick={() => onToggleOpen(row.id)}
          className="flex w-full items-center gap-1.5 py-[3px] pl-4 pr-2 text-left text-xs text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
        >
          <span className="shrink-0">
            {row.isOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
          <Globe className="h-3 w-3 shrink-0 opacity-50" />
          <span className="flex-1 truncate font-medium">{row.remoteName}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-sidebar-muted-foreground/40">
            {row.count}
          </span>
        </button>
      )

    case 'remote-branch': {
      const displayName = row.branch.shortName.replace(new RegExp(`^${row.remoteName}/`), '')
      return (
        <div
          className={`group/rbranch relative flex items-center gap-1.5 py-[3px] pl-10 pr-2 text-xs transition-colors ${
            row.isSelected
              ? 'bg-sidebar-accent text-sidebar-foreground'
              : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
          }`}
          onClick={() => onSelectBranch(row.branch.name)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onSelectBranch(row.branch.name)}
        >
          <BranchIcon className="h-3 w-3 shrink-0 opacity-30" />
          <HoverExpandLabel>{highlightMatch(displayName, filterQuery)}</HoverExpandLabel>
          {(row.branch.aheadCount > 0 || row.branch.behindCount > 0) && (
            <span className="shrink-0 text-[10px] tabular-nums">
              {row.branch.aheadCount > 0 && (
                <span className="text-blue-400">↑{row.branch.aheadCount}</span>
              )}
              {row.branch.behindCount > 0 && (
                <span className="ml-0.5 text-orange-400">↓{row.branch.behindCount}</span>
              )}
            </span>
          )}
        </div>
      )
    }

    case 'subgroup':
      return (
        <button
          onClick={() => onToggleOpen(row.id)}
          className="flex w-full items-center gap-1 px-4 py-[3px] text-left text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted-foreground/60 transition-colors hover:bg-sidebar-accent/30 hover:text-sidebar-muted-foreground"
        >
          <span className="shrink-0">
            {row.isOpen ? (
              <ChevronDown className="h-2.5 w-2.5" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5" />
            )}
          </span>
          <span className="flex-1">{row.label}</span>
          <span className="tabular-nums">{row.count}</span>
        </button>
      )

    case 'pr':
      return (
        <PullRequestItem
          pr={row.pr}
          onOpen={onOpenPr}
          isSelected={row.isSelected}
          filterQuery={filterQuery}
        />
      )

    case 'tag':
      return (
        <div
          className={`group/tag relative flex items-center gap-1.5 py-[3px] pl-6 pr-2 text-xs transition-colors ${
            row.isSelected
              ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
              : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
          }`}
          onClick={() => onSelectBranch(row.tag.name)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onSelectBranch(row.tag.name)}
        >
          <TagIcon className="h-3 w-3 shrink-0 opacity-30" />
          <HoverExpandLabel>{highlightMatch(row.tag.shortName, filterQuery)}</HoverExpandLabel>
          <span className="shrink-0 font-mono text-[10px] font-normal tabular-nums text-sidebar-muted-foreground/40">
            {row.tag.commitOid.slice(0, 7)}
          </span>
        </div>
      )

    case 'stash': {
      const isHidden = hiddenStashes.includes(row.stash.commitOid)
      return (
        <div
          className={`group/stash relative flex cursor-pointer items-center gap-1.5 py-[3px] pl-6 pr-2 text-xs transition-colors ${
            row.isSelected
              ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
              : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
          } ${isHidden ? 'opacity-50' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if ((e.target as HTMLElement).closest('[data-toggle]')) {
              return
            }
            onSelectBranch(row.stash.commitOid)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onStashContextMenu?.(e, row.stash)
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              if ((e.target as HTMLElement).closest('[data-toggle]')) return
              onSelectBranch(row.stash.commitOid)
            }
          }}
          data-testid={`stash-item-${row.stash.index}`}
        >
          <span
            data-toggle="stash-visibility"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onToggleStashVisibility?.(row.stash.commitOid)
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onMouseUp={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            className="absolute left-1 z-10 shrink-0 cursor-pointer rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-foreground group-hover/stash:opacity-100"
            title={
              isHidden ? 'Afficher le stash dans le graphe' : 'Masquer le stash dans le graphe'
            }
            aria-label={
              isHidden ? 'Afficher le stash dans le graphe' : 'Masquer le stash dans le graphe'
            }
          >
            {isHidden ? (
              <EyeOff className="h-3.5 w-3.5 text-sidebar-muted-foreground/60" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-violet-400" />
            )}
          </span>
          <ArchiveIcon className="h-3 w-3 shrink-0 text-violet-400 opacity-40" />
          <HoverExpandLabel className="min-w-0 flex-1 truncate">
            {highlightMatch(row.stash.message || `stash@{${row.stash.index}}`, filterQuery)}
          </HoverExpandLabel>
          <span className="shrink-0 font-mono text-[10px] font-normal tabular-nums text-sidebar-muted-foreground/40">
            {row.stash.commitOid.slice(0, 7)}
          </span>
        </div>
      )
    }

    case 'submodule':
      return (
        <div
          data-testid={`submodule-item-${row.sm.path}`}
          className="group/sm relative flex items-start gap-1.5 py-[3px] pl-6 pr-2 text-xs text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <GitFork className="mt-0.5 h-3 w-3 shrink-0 opacity-30" />
          <div className="min-w-0 flex-1">
            <HoverExpandLabel className="font-medium">
              {highlightMatch(row.sm.path, filterQuery)}
            </HoverExpandLabel>
            <span className="block truncate text-[10px] text-sidebar-muted-foreground/50">
              {row.sm.url.replace(/^(https?:\/\/|git@)/, '').replace(/\.git$/, '')}
            </span>
          </div>
          {row.sm.headOid && (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-sidebar-muted-foreground/30">
              {row.sm.headOid.slice(0, 7)}
            </span>
          )}
        </div>
      )

    case 'worktree':
      return (
        <div
          data-testid={`worktree-item-${row.wt.path}`}
          className="group/wt relative flex items-start gap-1.5 py-[3px] pl-6 pr-2 text-xs text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <Layers className="mt-0.5 h-3 w-3 shrink-0 opacity-30" />
          <div className="min-w-0 flex-1">
            <HoverExpandLabel className="font-medium">
              {row.wt.isLocked && <Lock className="mr-1 inline h-2.5 w-2.5 text-amber-400" />}
              {highlightMatch(row.wt.branch, filterQuery)}
            </HoverExpandLabel>
            <span className="block truncate text-[10px] text-sidebar-muted-foreground/50">
              {highlightMatch(row.wt.path, filterQuery)}
            </span>
          </div>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-sidebar-muted-foreground/30">
            {row.wt.commitOid.slice(0, 7)}
          </span>
          {onRemoveWorktree && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemoveWorktree(row.wt)
              }}
              className="absolute right-1 top-1 shrink-0 rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all hover:bg-sidebar-accent/80 hover:text-destructive group-hover/wt:opacity-100"
              aria-label="Remove worktree"
              title="Remove worktree"
              data-testid={`worktree-remove-button-${row.wt.path}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )

    case 'message':
      return (
        <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-sidebar-muted-foreground/70">
          {row.loading && <Spinner className="h-3 w-3 text-sidebar-muted-foreground" />}
          <span>{row.text}</span>
        </div>
      )

    case 'divider':
      return <div className="my-1 border-t border-sidebar-border/50" />

    default:
      return null
  }
}
