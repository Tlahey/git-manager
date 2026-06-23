import { useState } from 'react'
import { Globe, ChevronDown, ChevronRight, GitBranch as BranchIcon } from 'lucide-react'
import type { GitBranch } from '@git-manager/git-types'
import { useBranches } from '../../hooks/useBranches'
import { SectionHeader } from './SectionHeader'
import { HoverExpandLabel } from './HoverExpandLabel'

interface RemotesSectionProps {
  repoPath: string
  selectedBranch: string | null
  filter?: string
  onSelectBranch: (name: string) => void
}

interface RemoteGroupProps {
  remoteName: string
  branches: GitBranch[]
  selectedBranch: string | null
  onSelect: (name: string) => void
}

function RemoteGroup({ remoteName, branches, selectedBranch, onSelect }: RemoteGroupProps) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div>
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 py-[3px] pl-4 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        <span className="shrink-0">
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
        <Globe className="h-3 w-3 shrink-0 opacity-50" />
        <span className="flex-1 font-medium">{remoteName}</span>
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/40">
          {branches.length}
        </span>
      </button>

      {isOpen && (
        <div>
          {branches.map((branch) => {
            // shortName pour remote = "origin/main" → afficher sans le préfixe remote
            const displayName = branch.shortName.replace(new RegExp(`^${remoteName}/`), '')
            const isSelected =
              selectedBranch === branch.shortName || selectedBranch === branch.name

            return (
              <div
                key={branch.name}
                className={`group/rbranch relative flex items-center gap-1.5 py-[3px] pl-10 pr-2 text-xs transition-colors ${
                  isSelected
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                }`}
                onClick={() => onSelect(branch.shortName)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(branch.shortName)}
              >
                <BranchIcon className="h-3 w-3 shrink-0 opacity-30" />

                {/* Hover-expand pour les noms de branches longs */}
                <HoverExpandLabel>{displayName}</HoverExpandLabel>

                {/* Ahead/Behind */}
                {(branch.aheadCount > 0 || branch.behindCount > 0) && (
                  <span className="shrink-0 tabular-nums text-[10px]">
                    {branch.aheadCount > 0 && (
                      <span className="text-blue-400">↑{branch.aheadCount}</span>
                    )}
                    {branch.behindCount > 0 && (
                      <span className="ml-0.5 text-orange-400">↓{branch.behindCount}</span>
                    )}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function RemotesSection({
  repoPath,
  selectedBranch,
  filter = '',
  onSelectBranch,
}: RemotesSectionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const { data: allBranches = [] } = useBranches(repoPath)

  const q = filter.trim().toLowerCase()
  const remoteBranches = allBranches.filter(
    (b) => b.isRemote && (!q || b.shortName.toLowerCase().includes(q))
  )

  // Grouper par remote (première partie du shortName, ex: "origin")
  const remoteGroups = new Map<string, GitBranch[]>()
  for (const branch of remoteBranches) {
    const slashIdx = branch.shortName.indexOf('/')
    const remoteName = slashIdx > 0 ? branch.shortName.slice(0, slashIdx) : 'origin'
    const existing = remoteGroups.get(remoteName) ?? []
    remoteGroups.set(remoteName, [...existing, branch])
  }

  if (remoteBranches.length === 0) return null

  return (
    <div>
      <SectionHeader
        title="Remotes"
        icon={<Globe className="h-3 w-3" />}
        count={remoteBranches.length}
        isOpen={isOpen}
        onToggle={() => setIsOpen((o) => !o)}
      />

      {isOpen && (
        <div className="pb-1">
          {Array.from(remoteGroups.entries()).map(([remoteName, branches]) => (
            <RemoteGroup
              key={remoteName}
              remoteName={remoteName}
              branches={branches}
              selectedBranch={selectedBranch}
              onSelect={onSelectBranch}
            />
          ))}
        </div>
      )}
    </div>
  )
}
