import { CircleDot, CircleCheck, MessageSquare, MoreVertical } from 'lucide-react'
import { Tooltip } from '@git-manager/ui'
import { highlightMatch } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import type { MockIssue } from '../../../app/pull-requests/types'
import { IssueHoverCard } from './IssueHoverCard'

interface IssueItemProps {
  issue: MockIssue
  /** Active sidebar search query — matched substrings are highlighted in the issue title. */
  filterQuery?: string
  /** Opens the issue's action menu (create a branch, view on GitHub, copy link). */
  onContextMenu?: (e: React.MouseEvent, issue: MockIssue) => void
  /** Opens the issue in the app's own issue view (center panel). */
  onOpen?: (issue: MockIssue) => void
}

/**
 * One issue in the sidebar's Issues section. The state glyph sits in front of the title (open =
 * green dot, closed = purple check), and resting the pointer on the row reveals the full
 * {@link IssueHoverCard} preview.
 *
 * Clicking opens the issue in the app's own issue view rather than in the browser; GitHub is one
 * entry of the actions menu, reachable from the "…" button or a right-click — the two open the same
 * menu, so pointing at it costs the same as knowing the shortcut.
 */
export function IssueItem({ issue, filterQuery = '', onContextMenu, onOpen }: IssueItemProps) {
  const { t } = useTranslation('git')
  const isOpen = issue.status === 'open'
  const open = () => onOpen?.(issue)

  return (
    <Tooltip
      content={<IssueHoverCard issue={issue} />}
      placement="right"
      delay={400}
      // The card owns its own padding (it is two columns split by a border, which the bubble's
      // uniform padding would cut short of the edges), and clips to the bubble's rounded corners.
      className="max-w-none overflow-hidden px-0 py-0"
    >
      <div
        className="group/issue relative flex cursor-pointer items-start gap-1.5 py-1 pr-2 pl-6 text-xs text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-toggle]')) return
          open()
        }}
        onContextMenu={(e) => {
          if (!onContextMenu) return
          e.preventDefault()
          e.stopPropagation()
          onContextMenu(e, issue)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if ((e.target as HTMLElement).closest('[data-toggle]')) return
          open()
        }}
        data-testid={`issue-item-${issue.number}`}
      >
        {isOpen ? (
          <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
        ) : (
          <CircleCheck className="mt-0.5 h-3 w-3 shrink-0 text-purple-400" />
        )}

        <div className="min-w-0 flex-1">
          {/* Plainly truncated, unlike the branch/tag rows: the hover card already shows the full
              title, so the expand-on-hover overlay would only cover the row it explains. */}
          <div className="truncate text-xs">
            <span className="font-mono text-sidebar-muted-foreground/60">#{issue.number}</span>{' '}
            {highlightMatch(issue.title, filterQuery)}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-sidebar-muted-foreground/70">
            <span className="truncate">{issue.author}</span>
            {issue.comments > 0 && (
              <span className="flex shrink-0 items-center gap-0.5">
                <MessageSquare className="h-2.5 w-2.5" />
                {issue.comments}
              </span>
            )}
          </div>
        </div>

        {/* Same menu as the row's right-click — marked so the row's own click/Enter skip it. */}
        <button
          data-toggle="issue-actions"
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu?.(e, issue)
          }}
          className="mt-0.5 shrink-0 cursor-pointer rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all group-hover/issue:opacity-100 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
          aria-label={t('sidebar.issueActions')}
          title={t('sidebar.issueActions')}
          data-testid={`issue-actions-button-${issue.number}`}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </div>
    </Tooltip>
  )
}
