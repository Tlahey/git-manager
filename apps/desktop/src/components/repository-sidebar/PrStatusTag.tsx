import {
  Github,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  CircleX,
  Clock,
} from 'lucide-react'
import type { PullRequest } from '@git-manager/git-types'
import { useTranslation } from '@git-manager/i18n'
import { derivePrTagStatus, PR_TAG_STATUS_LABEL_KEY, type PrTagStatus } from './prTagStatus'

interface PrStatusTagProps {
  pr: PullRequest
  /** Opens the PR (e.g. in the Launchpad detail view). Clicking the tag stops row-click propagation. */
  onOpen?: (pr: PullRequest) => void
}

/** Per-status pill colors (border + subtle fill) + the status glyph shown next to the GitHub mark. */
const STATUS_STYLES: Record<PrTagStatus, { pill: string; Icon: typeof GitPullRequest; icon: string }> =
  {
    open: {
      pill: 'border-green-500/30 bg-green-500/10 text-green-400',
      Icon: GitPullRequest,
      icon: 'text-green-400',
    },
    merged: {
      pill: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
      Icon: GitMerge,
      icon: 'text-purple-400',
    },
    failed: {
      pill: 'border-red-500/30 bg-red-500/10 text-red-400',
      Icon: CircleX,
      icon: 'text-red-400',
    },
    pending: {
      pill: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
      Icon: Clock,
      icon: 'text-amber-400',
    },
    draft: {
      pill: 'border-sidebar-border bg-sidebar-accent text-sidebar-muted-foreground',
      Icon: GitPullRequestDraft,
      icon: 'text-sidebar-muted-foreground',
    },
    closed: {
      pill: 'border-red-500/30 bg-red-500/10 text-red-400',
      Icon: GitPullRequestClosed,
      icon: 'text-red-400',
    },
  }

/**
 * "Large" tag shown on the right of a branch/worktree row when that ref is linked to a pull request:
 * the GitHub mark, the PR's status glyph (open / merged / checks failing / queued / draft / closed),
 * and its `#number`. Clicking it opens the PR without triggering the row's own click.
 */
export function PrStatusTag({ pr, onOpen }: PrStatusTagProps) {
  const { t } = useTranslation('git')
  const status = derivePrTagStatus(pr)
  const { pill, Icon, icon } = STATUS_STYLES[status]
  const label = t('sidebar.prTag.label', {
    number: pr.number,
    status: t(PR_TAG_STATUS_LABEL_KEY[status]),
  })

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen?.(pr)
      }}
      className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums leading-none transition-colors hover:brightness-110 ${pill}`}
      aria-label={label}
      title={label}
      data-testid={`pr-status-tag-${pr.number}`}
    >
      <Github className="h-3 w-3 shrink-0 opacity-80" />
      <Icon className={`h-3 w-3 shrink-0 ${icon}`} />
      <span>#{pr.number}</span>
    </button>
  )
}
