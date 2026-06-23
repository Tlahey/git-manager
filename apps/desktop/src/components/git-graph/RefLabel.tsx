import type { GitRef, GitRefType } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { GitCommitHorizontal, Tag as TagIcon, Globe } from 'lucide-react'

interface RefLabelProps {
  gitRef: GitRef
}

const VARIANT_CLASSES: Record<GitRefType, string> = {
  HEAD: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold',
  branch: 'bg-teal-500/20 text-teal-300 border border-teal-500/40',
  tag: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
  remote: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
}

export function RefLabel({ gitRef }: RefLabelProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-[180px] items-center gap-0.5 rounded px-1.5 py-0 text-[10px] leading-5 font-medium',
        VARIANT_CLASSES[gitRef.type],
      )}
    >
      {gitRef.type === 'HEAD' && <GitCommitHorizontal className="h-2.5 w-2.5 shrink-0" />}
      {gitRef.type === 'tag' && <TagIcon className="h-2.5 w-2.5 shrink-0" />}
      {gitRef.type === 'remote' && <Globe className="h-2.5 w-2.5 shrink-0" />}
      <span className="truncate">
        {gitRef.type === 'HEAD' ? 'HEAD' : gitRef.shortName}
      </span>
    </span>
  )
}
