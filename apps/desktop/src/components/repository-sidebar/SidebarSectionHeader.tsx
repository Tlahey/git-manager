import {
  HardDrive,
  Globe,
  GitPullRequest,
  Tag as TagIcon,
  GitFork,
  Archive as ArchiveIcon,
  Layers,
  Plus,
  Recycle,
  MoreVertical,
  GitMerge,
  UserCheck,
} from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@git-manager/ui'
import type { SectionKey } from './types'
import { SectionHeader } from './SectionHeader'

const SECTION_ICONS: Record<SectionKey, React.ReactNode> = {
  local: <HardDrive className="h-3 w-3" />,
  remotes: <Globe className="h-3 w-3" />,
  prs: <GitPullRequest className="h-3 w-3" />,
  tags: <TagIcon className="h-3 w-3" />,
  submodules: <GitFork className="h-3 w-3" />,
  stashes: <ArchiveIcon className="h-3 w-3" />,
  worktrees: <Layers className="h-3 w-3" />,
}

interface SidebarSectionHeaderProps {
  sectionKey: SectionKey
  title: string
  count?: number
  isOpen: boolean
  onToggle: () => void
  onCreateBranch?: () => void
  onPruneBranches?: () => void
  onRemoveMergedBranches?: () => void
  onRemoveMyMergedBranches?: () => void
  onAddWorktree?: () => void
  onPruneWorktrees?: () => void
  onRemoveMergedWorktrees?: () => void
  onRemoveMyMergedWorktrees?: () => void
  onCreatePr?: () => void
  /** When true, `count` reflects an active search filter rather than the section's full contents. */
  isFiltered?: boolean
}

export function SidebarSectionHeader({
  sectionKey,
  title,
  count,
  isOpen,
  onToggle,
  onCreateBranch,
  onPruneBranches,
  onRemoveMergedBranches,
  onRemoveMyMergedBranches,
  onAddWorktree,
  onPruneWorktrees,
  onRemoveMergedWorktrees,
  onRemoveMyMergedWorktrees,
  onCreatePr,
  isFiltered = false,
}: SidebarSectionHeaderProps) {
  return (
    <SectionHeader
      title={title}
      icon={SECTION_ICONS[sectionKey]}
      count={count}
      isOpen={isOpen}
      onToggle={onToggle}
      testId={`sidebar-section-${sectionKey}`}
      isFiltered={isFiltered}
      action={
        sectionKey === 'local' &&
        (onCreateBranch ||
          onPruneBranches ||
          onRemoveMergedBranches ||
          onRemoveMyMergedBranches) ? (
          <>
            {(onPruneBranches || onRemoveMergedBranches || onRemoveMyMergedBranches) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="mr-0.5 rounded p-0.5 transition-colors hover:bg-sidebar-accent"
                    aria-label="Branch actions"
                    title="Branch actions"
                    data-testid="branch-actions-menu-trigger"
                  >
                    <MoreVertical className="h-3.5 w-3.5 text-sidebar-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onPruneBranches && (
                    <DropdownMenuItem
                      onSelect={onPruneBranches}
                      className="gap-2 text-xs"
                      data-testid="branch-prune-menu-item"
                    >
                      <Recycle className="h-3.5 w-3.5 text-muted-foreground" />
                      Prune local branches
                    </DropdownMenuItem>
                  )}
                  {onRemoveMergedBranches && (
                    <DropdownMenuItem
                      onSelect={onRemoveMergedBranches}
                      className="gap-2 text-xs"
                      data-testid="branch-remove-merged-menu-item"
                    >
                      <GitMerge className="h-3.5 w-3.5 text-muted-foreground" />
                      Remove merged branches
                    </DropdownMenuItem>
                  )}
                  {onRemoveMyMergedBranches && (
                    <DropdownMenuItem
                      onSelect={onRemoveMyMergedBranches}
                      className="gap-2 text-xs"
                      data-testid="branch-remove-my-merged-menu-item"
                    >
                      <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      Remove my merged branches
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {onCreateBranch && (
              <button
                onClick={onCreateBranch}
                className="mr-1 rounded p-0.5 transition-colors hover:bg-sidebar-accent"
                aria-label="Créer une branche"
                title="Créer une branche"
              >
                <Plus className="h-3.5 w-3.5 text-sidebar-muted-foreground" />
              </button>
            )}
          </>
        ) : sectionKey === 'worktrees' &&
          (onAddWorktree ||
            onPruneWorktrees ||
            onRemoveMergedWorktrees ||
            onRemoveMyMergedWorktrees) ? (
          <>
            {(onPruneWorktrees || onRemoveMergedWorktrees || onRemoveMyMergedWorktrees) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="mr-0.5 rounded p-0.5 transition-colors hover:bg-sidebar-accent"
                    aria-label="Worktree actions"
                    title="Worktree actions"
                    data-testid="worktree-actions-menu-trigger"
                  >
                    <MoreVertical className="h-3.5 w-3.5 text-sidebar-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onPruneWorktrees && (
                    <DropdownMenuItem
                      onSelect={onPruneWorktrees}
                      className="gap-2 text-xs"
                      data-testid="worktree-prune-menu-item"
                    >
                      <Recycle className="h-3.5 w-3.5 text-muted-foreground" />
                      Prune worktrees
                    </DropdownMenuItem>
                  )}
                  {onRemoveMergedWorktrees && (
                    <DropdownMenuItem
                      onSelect={onRemoveMergedWorktrees}
                      className="gap-2 text-xs"
                      data-testid="worktree-remove-merged-menu-item"
                    >
                      <GitMerge className="h-3.5 w-3.5 text-muted-foreground" />
                      Remove merged worktrees
                    </DropdownMenuItem>
                  )}
                  {onRemoveMyMergedWorktrees && (
                    <DropdownMenuItem
                      onSelect={onRemoveMyMergedWorktrees}
                      className="gap-2 text-xs"
                      data-testid="worktree-remove-my-merged-menu-item"
                    >
                      <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      Remove my merged worktrees
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {onAddWorktree && (
              <button
                onClick={onAddWorktree}
                className="mr-1 rounded p-0.5 transition-colors hover:bg-sidebar-accent"
                aria-label="Add worktree"
                title="Add worktree"
                data-testid="worktree-add-button"
              >
                <Plus className="h-3.5 w-3.5 text-sidebar-muted-foreground" />
              </button>
            )}
          </>
        ) : sectionKey === 'prs' && onCreatePr ? (
          <button
            onClick={onCreatePr}
            className="mr-1 rounded p-0.5 transition-colors hover:bg-sidebar-accent"
            aria-label="Create pull request"
            title="Create pull request"
            data-testid="pr-create-button"
          >
            <Plus className="h-3.5 w-3.5 text-sidebar-muted-foreground" />
          </button>
        ) : undefined
      }
    />
  )
}
