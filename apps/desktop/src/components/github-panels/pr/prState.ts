import { GitPullRequest, GitPullRequestDraft, GitMerge, GitPullRequestClosed } from 'lucide-react'
import type { ComponentType } from 'react'

export type PrStateKind = 'open' | 'closed' | 'draft' | 'merged'

export interface PrStateLike {
  state: string
  draft: boolean
  merged_at: string | null
}

/** Resolve a PR into one of the four display states (merged wins over closed wins over draft). */
export function prStateKind(pr: PrStateLike): PrStateKind {
  if (pr.merged_at) return 'merged'
  if (pr.state === 'closed') return 'closed'
  if (pr.draft) return 'draft'
  return 'open'
}

interface PrStateVisual {
  labelKey: string
  /** Tailwind classes for the pill tag (bg + text). */
  badgeClassName: string
  /** Tailwind text color for the standalone state icon. */
  iconClassName: string
  icon: ComponentType<{ className?: string }>
}

const VISUALS: Record<PrStateKind, PrStateVisual> = {
  open: {
    labelKey: 'pr.state.open',
    badgeClassName: 'bg-green-500/15 text-green-500',
    iconClassName: 'text-green-500',
    icon: GitPullRequest,
  },
  draft: {
    labelKey: 'pr.state.draft',
    badgeClassName: 'bg-muted text-muted-foreground',
    iconClassName: 'text-muted-foreground',
    icon: GitPullRequestDraft,
  },
  closed: {
    labelKey: 'pr.state.closed',
    badgeClassName: 'bg-destructive/15 text-destructive',
    iconClassName: 'text-destructive',
    icon: GitPullRequestClosed,
  },
  merged: {
    labelKey: 'pr.state.merged',
    badgeClassName: 'bg-purple-500/15 text-purple-500',
    iconClassName: 'text-purple-500',
    icon: GitMerge,
  },
}

export function prStateVisual(kind: PrStateKind): PrStateVisual {
  return VISUALS[kind]
}
