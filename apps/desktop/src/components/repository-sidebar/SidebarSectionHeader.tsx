import {
  HardDrive,
  Globe,
  GitPullRequest,
  Tag as TagIcon,
  GitFork,
  Archive as ArchiveIcon,
  Layers,
  Plus,
} from 'lucide-react'
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
  onAddWorktree?: () => void
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
  onAddWorktree,
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
        sectionKey === 'local' && onCreateBranch ? (
          <button
            onClick={onCreateBranch}
            className="mr-1 rounded p-0.5 transition-colors hover:bg-sidebar-accent"
            aria-label="Créer une branche"
            title="Créer une branche"
          >
            <Plus className="h-3.5 w-3.5 text-sidebar-muted-foreground" />
          </button>
        ) : sectionKey === 'worktrees' && onAddWorktree ? (
          <button
            onClick={onAddWorktree}
            className="mr-1 rounded p-0.5 transition-colors hover:bg-sidebar-accent"
            aria-label="Add worktree"
            title="Add worktree"
            data-testid="worktree-add-button"
          >
            <Plus className="h-3.5 w-3.5 text-sidebar-muted-foreground" />
          </button>
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
