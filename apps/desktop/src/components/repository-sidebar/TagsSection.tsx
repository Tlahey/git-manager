import { useState } from 'react'
import { Tag as TagIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { GitRef } from '@git-manager/git-types'
import { getTags } from '../../lib/tauri'
import { SectionHeader } from './SectionHeader'
import { HoverExpandLabel } from './HoverExpandLabel'

interface TagsSectionProps {
  repoPath: string
}

export function TagsSection({ repoPath }: TagsSectionProps) {
  const [isOpen, setIsOpen] = useState(false)

  const { data: tags = [] } = useQuery<GitRef[]>({
    queryKey: ['tags', repoPath],
    queryFn: () => getTags(repoPath),
    enabled: !!repoPath,
    staleTime: 30_000,
  })

  if (tags.length === 0) return null

  return (
    <div>
      <SectionHeader
        title="Tags"
        icon={<TagIcon className="h-3 w-3" />}
        count={tags.length}
        isOpen={isOpen}
        onToggle={() => setIsOpen((o) => !o)}
      />

      {isOpen && (
        <div className="pb-1">
          {tags.slice(0, 100).map((tag) => (
            <div
              key={tag.name}
              className="group/tag relative flex items-center gap-1.5 py-[3px] pl-6 pr-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <TagIcon className="h-3 w-3 shrink-0 opacity-30" />

              {/* Hover-expand */}
              <HoverExpandLabel>{tag.shortName}</HoverExpandLabel>

              <span className="shrink-0 tabular-nums text-[10px] font-mono text-muted-foreground/40">
                {tag.commitOid.slice(0, 7)}
              </span>
            </div>
          ))}
          {tags.length > 100 && (
            <p className="px-6 py-1 text-[10px] text-muted-foreground/50">
              + {tags.length - 100} autres tags
            </p>
          )}
        </div>
      )}
    </div>
  )
}
