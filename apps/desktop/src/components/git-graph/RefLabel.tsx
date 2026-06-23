import type { GitRef } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'
import { GitCommitHorizontal, Check, Laptop } from 'lucide-react'

interface RefLabelProps {
  gitRef: GitRef
  alwaysVisible?: boolean
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

export function RefLabel({ gitRef, alwaysVisible = false }: RefLabelProps) {
  const isHEAD = gitRef.type === 'HEAD'
  const isRemote = gitRef.type === 'remote'
  const isTag = gitRef.type === 'tag'

  const displayName = cleanName(gitRef)

  let badgeClasses = cn(
    'inline-flex min-w-0 max-w-[180px] items-center gap-0.5 rounded px-1.5 py-0 text-[10px] leading-5 font-medium border transition-all duration-150',
  )

  if (isHEAD) {
    badgeClasses = cn(badgeClasses, 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold')
  } else if (isRemote) {
    badgeClasses = cn(badgeClasses, 'bg-blue-500/20 text-blue-300 border-blue-500/40')
  } else {
    // Local branch or tag
    badgeClasses = cn(badgeClasses, 'bg-teal-500/20 text-teal-300 border-teal-500/40')
  }

  // Tags are hidden by default and only shown on hover with low opacity, unless in portal (alwaysVisible)
  if (isTag) {
    if (!alwaysVisible) {
      badgeClasses = cn(badgeClasses, 'hidden group-hover:inline-flex opacity-60')
    } else {
      badgeClasses = cn(badgeClasses, 'opacity-60')
    }
  }

  return (
    <span className={badgeClasses}>
      {isHEAD && <GitCommitHorizontal className="h-2.5 w-2.5 shrink-0" />}
      {!isHEAD && !isRemote && <Check className="h-2.5 w-2.5 shrink-0 text-teal-400" />}
      
      <span className="truncate">
        {isHEAD ? 'HEAD' : displayName}
      </span>

      {isRemote && <GithubIcon className="h-2.5 w-2.5 shrink-0 text-blue-400 ml-0.5" />}
      {!isHEAD && !isRemote && <Laptop className="h-2.5 w-2.5 shrink-0 text-teal-400 ml-0.5" />}
    </span>
  )
}
