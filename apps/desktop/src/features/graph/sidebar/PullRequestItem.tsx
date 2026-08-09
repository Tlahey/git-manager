import { useState } from 'react'
import {
  CheckCircle2,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  CircleX,
  Clock,
  XCircle,
  Loader2,
  MoreVertical,
} from 'lucide-react'
import { Tooltip } from '@git-manager/ui'
import { highlightMatch } from '@git-manager/components'
import type { PullRequest } from '@git-manager/git-types'
import { useTranslation } from '@git-manager/i18n'
import { usePrReviewSummary } from '../hooks/usePrReviewSummary'
import { PrHoverCard } from './PrHoverCard'
import { derivePrTagStatus, PR_STATE_LABEL_KEY, type PrTagStatus } from '../../../components/common/prTagStatus'

interface PullRequestItemProps {
  pr: PullRequest
  /** Repo the PR belongs to — resolves `owner/repo` + token for the hover card's review lookup. */
  repoPath?: string
  onOpen?: (pr: PullRequest) => void
  isSelected?: boolean
  /** Active sidebar search query — matched substrings are highlighted in the PR title. */
  filterQuery?: string
  /** 1 when the row sits under a PR sub-group header, so it indents past it. */
  depth?: 0 | 1
  /** Opens the PR's action menu — the row's "…" button and its right-click both lead here. */
  onContextMenu?: (e: React.MouseEvent, pr: PullRequest) => void
}

/**
 * The leading state glyph. Shares `derivePrTagStatus` with `PrStatusTag` so a PR reads the same
 * whether you meet it on its own row here or as a tag on its branch — a draft, a PR with failing
 * checks and a plain open one are three different marks, not one generic "open" circle.
 */
const STATE_ICONS: Record<PrTagStatus, { Icon: typeof GitPullRequest; className: string }> = {
  open: { Icon: GitPullRequest, className: 'text-green-400' },
  merged: { Icon: GitMerge, className: 'text-purple-400' },
  failed: { Icon: CircleX, className: 'text-red-400' },
  pending: { Icon: Clock, className: 'text-amber-400' },
  draft: { Icon: GitPullRequestDraft, className: 'text-sidebar-muted-foreground' },
  closed: { Icon: GitPullRequestClosed, className: 'text-red-400' },
}

const STATE_PILLS: Record<PrTagStatus, string> = {
  open: 'bg-green-500/15 text-green-400 border-green-500/30',
  merged: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  draft: 'bg-sidebar-accent text-sidebar-muted-foreground border-sidebar-border',
  closed: 'bg-destructive/15 text-destructive border-destructive/30',
}

function CiIcon({ status }: { status: PullRequest['ciStatus'] }) {
  if (!status) return null
  if (status === 'success') return <CheckCircle2 className="h-3 w-3 text-green-400" />
  if (status === 'failure') return <XCircle className="h-3 w-3 text-red-400" />
  return <Loader2 className="h-3 w-3 animate-spin text-orange-400" />
}

export function PullRequestItem({
  pr,
  repoPath,
  onOpen,
  isSelected = false,
  filterQuery = '',
  depth = 0,
  onContextMenu,
}: PullRequestItemProps) {
  const { t } = useTranslation('git')
  // Gates the review lookup: the card's data is only fetched once this row is actually hovered,
  // so listing thirty PRs costs zero extra requests. It stays true afterwards so SWR can serve the
  // cached answer instantly on a second hover.
  const [hovered, setHovered] = useState(false)
  const { summary, isLoading } = usePrReviewSummary(repoPath ?? null, pr.number, hovered)

  const status = derivePrTagStatus(pr)
  const { Icon, className } = STATE_ICONS[status]

  return (
    <Tooltip
      content={<PrHoverCard pr={pr} summary={summary} isLoading={isLoading} />}
      placement="right"
      delay={400}
      className="max-w-none px-3 py-2.5"
    >
      <div
        className={`group/pr relative flex cursor-pointer items-start gap-2 py-1.5 pr-2 transition-colors ${
          depth === 1 ? 'pl-10' : 'pl-6'
        } ${
          isSelected
            ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
            : 'hover:bg-sidebar-accent/60'
        }`}
        onMouseEnter={() => setHovered(true)}
        onFocus={() => setHovered(true)}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-toggle]')) return
          onOpen?.(pr)
        }}
        onContextMenu={(e) => {
          if (!onContextMenu) return
          e.preventDefault()
          e.stopPropagation()
          onContextMenu(e, pr)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if ((e.target as HTMLElement).closest('[data-toggle]')) return
          onOpen?.(pr)
        }}
        data-testid={`pr-item-${pr.number}`}
      >
        {/* State glyph */}
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${className}`} aria-hidden />

        <div className="min-w-0 flex-1">
          {/* Plainly truncated, unlike the branch/tag rows: the hover card already shows the full
              title, so the expand-on-hover overlay would only cover the row it explains. */}
          <div
            className={`truncate text-xs ${isSelected ? 'font-medium text-sidebar-foreground' : 'text-sidebar-foreground'}`}
          >
            #{pr.number} {highlightMatch(pr.title, filterQuery)}
          </div>

          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded border px-1 py-px text-[9px] font-medium ${STATE_PILLS[status]}`}
            >
              {t(PR_STATE_LABEL_KEY[status])}
            </span>
            <span className="text-[10px] text-sidebar-muted-foreground">{pr.author}</span>
            <CiIcon status={pr.ciStatus} />
          </div>
        </div>

        {/* Same menu as the row's right-click — marked so the row's own click/Enter skip it. */}
        <button
          data-toggle="pr-actions"
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu?.(e, pr)
          }}
          className="mt-0.5 shrink-0 cursor-pointer rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all hover:bg-sidebar-accent/80 hover:text-sidebar-foreground group-hover/pr:opacity-100"
          aria-label={t('sidebar.prActions')}
          title={t('sidebar.prActions')}
          data-testid={`pr-actions-button-${pr.number}`}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </div>
    </Tooltip>
  )
}
