import { useState } from 'react'
import { ChevronDown, ChevronRight, FolderGit2 } from 'lucide-react'
import type { GitBranch } from '@git-manager/git-types'
import { BranchItem } from './BranchItem'

interface BranchFolderProps {
  prefix: string
  branches: GitBranch[]
  selectedBranch: string | null
  pinnedNames?: Set<string>
  onSelect: (name: string) => void
  onTogglePin?: (shortName: string) => void
  onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
}

export function BranchFolder({
  prefix,
  branches,
  selectedBranch,
  pinnedNames,
  onSelect,
  onTogglePin,
  onContextMenu,
}: BranchFolderProps) {
  const [isOpen, setIsOpen] = useState(true)

  const hasHead = branches.some((b) => b.isHead)

  return (
    <div>
      {/* En-tête du dossier */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 py-[3px] pl-4 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        <span className="shrink-0">
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
        <FolderGit2 className="h-3 w-3 shrink-0 opacity-50" />
        <span className="flex-1 font-medium">
          {hasHead && <span className="mr-1 text-[9px] text-emerald-400">●</span>}
          {prefix}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/40">
          {branches.length}
        </span>
      </button>

      {/* Branches enfants */}
      {isOpen && (
        <div>
          {branches.map((branch) => (
            <BranchItem
              key={branch.name}
              branch={branch}
              isSelected={selectedBranch === branch.shortName || selectedBranch === branch.name}
              depth={1}
              isPinned={pinnedNames?.has(branch.shortName) ?? false}
              onSelect={onSelect}
              onTogglePin={onTogglePin}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}
