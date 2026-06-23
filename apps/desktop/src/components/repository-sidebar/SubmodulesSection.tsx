import { useState } from 'react'
import { GitFork } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { GitSubmodule } from '@git-manager/git-types'
import { listSubmodules } from '../../lib/tauri'
import { SectionHeader } from './SectionHeader'
import { HoverExpandLabel } from './HoverExpandLabel'

interface SubmodulesSectionProps {
  repoPath: string
}

function shortenUrl(url: string): string {
  return url.replace(/^(https?:\/\/|git@)/, '').replace(/\.git$/, '')
}

export function SubmodulesSection({ repoPath }: SubmodulesSectionProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { data: submodules = [] } = useQuery<GitSubmodule[]>({
    queryKey: ['submodules', repoPath],
    queryFn: () => listSubmodules(repoPath),
    enabled: !!repoPath,
    staleTime: 60_000,
  })

  if (submodules.length === 0) return null

  return (
    <div>
      <SectionHeader
        title="Submodules"
        icon={<GitFork className="h-3 w-3" />}
        count={submodules.length}
        isOpen={isOpen}
        onToggle={() => setIsOpen((o) => !o)}
      />

      {isOpen && (
        <div className="pb-1">
          {submodules.map((sm) => (
            <div
              key={sm.path}
              className="group/sm relative flex items-start gap-1.5 py-[3px] pl-6 pr-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <GitFork className="mt-0.5 h-3 w-3 shrink-0 opacity-30" />
              <div className="min-w-0 flex-1">
                {/* Path avec hover-expand */}
                <HoverExpandLabel className="font-medium">{sm.path}</HoverExpandLabel>
                {/* URL */}
                <span className="block truncate text-[10px] text-muted-foreground/50">
                  {shortenUrl(sm.url)}
                </span>
              </div>
              {sm.headOid && (
                <span className="shrink-0 tabular-nums text-[10px] font-mono text-muted-foreground/30">
                  {sm.headOid.slice(0, 7)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
