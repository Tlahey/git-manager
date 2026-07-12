import { useTranslation } from '@git-manager/i18n'
import { ScrollArea } from '@git-manager/ui'
import {
  GitBranch as BranchIcon,
  Globe,
  HardDrive,
  Tag,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { useBranches } from '../../hooks/useBranches'
import type { GitBranch } from '@git-manager/git-types'

interface RepoBranchSidebarProps {
  repoPath: string
  selectedBranch: string | null
  onSelectBranch: (branch: string | null) => void
}

interface SectionProps {
  title: string
  icon: React.ReactNode
  branches: GitBranch[]
  selectedBranch: string | null
  onSelect: (name: string) => void
}

function BranchSection({ title, icon, branches, selectedBranch, onSelect }: SectionProps) {
  const [open, setOpen] = useState(true)

  if (branches.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-accent/40"
      >
        <span className="shrink-0 text-muted-foreground">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
        <span className="shrink-0 text-muted-foreground/70">{icon}</span>
        <span className="flex-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/50">{branches.length}</span>
      </button>

      {open && (
        <div className="pb-1">
          {branches.map((b) => {
            const isActive = selectedBranch === b.shortName || selectedBranch === b.name
            return (
              <button
                key={b.name}
                onClick={() => onSelect(b.shortName)}
                className={`flex w-full items-center gap-2 py-1 pl-6 pr-2 text-left text-xs transition-colors ${
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                }`}
              >
                <BranchIcon className="h-3 w-3 shrink-0 opacity-40" />
                <span className="flex-1 truncate">
                  {b.isHead && <span className="mr-1.5 text-[10px] text-emerald-400">●</span>}
                  <span className={b.isHead ? 'font-medium text-foreground' : ''}>
                    {b.shortName}
                  </span>
                </span>
                {(b.aheadCount > 0 || b.behindCount > 0) && (
                  <span className="shrink-0 text-[10px]">
                    {b.aheadCount > 0 && <span className="text-blue-400">↑{b.aheadCount}</span>}
                    {b.behindCount > 0 && (
                      <span className="ml-0.5 text-orange-400">↓{b.behindCount}</span>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function RepoBranchSidebar({
  repoPath,
  selectedBranch,
  onSelectBranch,
}: RepoBranchSidebarProps) {
  const { t } = useTranslation('git')
  const { data: branches = [] } = useBranches(repoPath)

  const localBranches = branches.filter((b) => !b.isRemote)
  const remoteBranches = branches.filter((b) => b.isRemote)

  const remoteGroups: Record<string, GitBranch[]> = {}
  for (const b of remoteBranches) {
    const remote = b.name.split('/')[2] ?? b.name.split('/')[0]
    if (!remoteGroups[remote]) remoteGroups[remote] = []
    remoteGroups[remote].push(b)
  }

  const headBranch = branches.find((b) => b.isHead)

  function handleSelect(name: string) {
    onSelectBranch(selectedBranch === name ? null : name)
  }

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <BranchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs font-semibold text-foreground">{t('branch.title')}</p>
        </div>
        {headBranch && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px]">
            <span className="text-emerald-400">●</span>
            <span className="truncate font-medium text-emerald-400">{headBranch.shortName}</span>
          </p>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {/* All branches */}
          <button
            onClick={() => onSelectBranch(null)}
            className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs transition-colors ${
              selectedBranch === null
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            }`}
          >
            <BranchIcon className="h-3 w-3 shrink-0 opacity-40" />
            <span className="italic">All branches</span>
          </button>

          <div className="my-1.5 border-t border-border/40" />

          {/* Branches locales */}
          <BranchSection
            title="Local"
            icon={<HardDrive className="h-3 w-3" />}
            branches={localBranches}
            selectedBranch={selectedBranch}
            onSelect={handleSelect}
          />

          {/* Branches remote par groupe */}
          {Object.entries(remoteGroups).map(([remote, rBranches]) => (
            <BranchSection
              key={remote}
              title={`Remote · ${remote}`}
              icon={<Globe className="h-3 w-3" />}
              branches={rBranches}
              selectedBranch={selectedBranch}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Footer tags */}
      <div className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <Tag className="h-3 w-3 shrink-0" />
        <span>Tags visible in graph</span>
      </div>
    </div>
  )
}
