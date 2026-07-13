import type { GitRef } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { GitCommitHorizontal, Check, Laptop, Tag, Archive } from 'lucide-react'

interface RefLabelProps {
  gitRef: GitRef
  color?: string
}

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>GitHub</title>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

const cleanName = (ref: GitRef) => {
  if (ref.type === 'remote') {
    const parts = ref.shortName.split('/')
    if (parts.length > 1) {
      return parts.slice(1).join('/')
    }
  }
  return ref.shortName
}

export function RefLabel({ gitRef, color }: RefLabelProps) {
  const isHEAD = gitRef.type === 'HEAD'
  const isRemote = gitRef.type === 'remote'
  const isTag = gitRef.type === 'tag'
  const isStash = gitRef.type === 'stash'

  const displayName = cleanName(gitRef)

  const isLocalMainOrMaster = gitRef.shortName === 'main' || gitRef.shortName === 'master'

  const isRemoteMainOrMaster =
    gitRef.shortName.endsWith('/main') || gitRef.shortName.endsWith('/master')

  let refColor = color || '#2563eb'
  if (isLocalMainOrMaster) {
    refColor = '#2563eb'
  } else if (isRemoteMainOrMaster) {
    refColor = '#7c3aed'
  } else if (isStash) {
    refColor = '#a78bfa'
  }

  let badgeClasses = cn(
    'inline-flex min-w-0 max-w-[180px] items-center gap-1 rounded px-1.5 py-0 text-[11px] leading-5 font-medium border bg-background transition-all duration-150'
  )

  // Custom inline styles for coloring (non-HEAD)
  const customStyle: React.CSSProperties = {}

  if (isHEAD) {
    badgeClasses = cn(badgeClasses, 'text-emerald-300 border-emerald-500/40 font-semibold')
    customStyle.backgroundImage =
      'linear-gradient(rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.2))'
  } else {
    customStyle.backgroundImage = `linear-gradient(${refColor}25, ${refColor}25)` // ~15% opacity overlay over solid bg-background
    customStyle.borderColor = `${refColor}50` // ~30% opacity
    customStyle.color = refColor
    if (isRemote) {
      customStyle.borderStyle = 'dashed'
      badgeClasses = cn(badgeClasses, 'opacity-80')
    } else if (isStash) {
      customStyle.borderStyle = 'dashed'
      badgeClasses = cn(badgeClasses, 'opacity-90')
    }
  }

  // Tags are always visible with high opacity
  if (isTag) {
    badgeClasses = cn(badgeClasses, 'opacity-90')
  }

  return (
    <span
      className={badgeClasses}
      style={customStyle}
      data-testid={`ref-label-${gitRef.type}-${gitRef.shortName}`}
    >
      {isHEAD && <GitCommitHorizontal className="h-3 w-3 shrink-0" />}
      {!isHEAD && !isRemote && !isTag && !isStash && <Check className="h-3 w-3 shrink-0" />}
      {isTag && <Tag className="h-3 w-3 shrink-0" />}
      {isStash && <Archive className="h-3 w-3 shrink-0" />}

      <span className="truncate">{isHEAD ? 'HEAD' : displayName}</span>

      {isRemote && <GithubIcon className="ml-0.5 h-3 w-3 shrink-0" />}
      {!isHEAD && !isRemote && !isTag && !isStash && <Laptop className="ml-0.5 h-3 w-3 shrink-0" />}
    </span>
  )
}
