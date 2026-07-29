import { CircleDot, CircleCheck, MessageSquare, ThumbsUp } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { PrSidebarSection } from '../git-graph/pr/PrSidebarSection'
import { PrUserList } from '../git-graph/pr/PrUserList'
import type { MockIssue } from '../../app/pull-requests/types'
import { timeAgo } from '../../app/pull-requests/utils'
import { issueExcerpt } from './issueExcerpt'

interface IssueHoverCardProps {
  issue: MockIssue
}

/** Labels beyond this are collapsed into a "+N" chip so the card keeps a predictable height. */
const MAX_LABELS = 6

/**
 * The preview shown when the pointer rests on an issue row: the title, the opening of the
 * description, and the issue's own metadata column.
 *
 * Laid out as the in-app issue view is — body on the left, metadata on the right — and built from
 * that view's own `PrSidebarSection` / `PrUserList` pieces, so a section looks the same whether you
 * are glancing at it here or reading the full issue. What it does *not* reuse is
 * {@link IssueMetaSidebar} itself: that component edits (status dropdown, assignee/label popovers)
 * and fetches the issue's detail on mount, neither of which belongs behind a pointer that leaves
 * the moment you move it — and a request per hover would burn the API budget on a glance.
 *
 * Everything here comes from the already-fetched list item, so unlike the pull request card this one
 * needs no follow-up request: the issue endpoints carry the body, labels, assignees and reactions.
 */
export function IssueHoverCard({ issue }: IssueHoverCardProps) {
  const { t } = useTranslation('git')
  const isOpen = issue.status === 'open'
  const excerpt = issueExcerpt(issue.body)
  const extraLabels = issue.labels.length - MAX_LABELS

  return (
    <div className="flex w-[30rem] whitespace-normal" data-testid={`issue-hover-card-${issue.number}`}>
      {/* Left: what the issue is about. */}
      <div className="flex min-w-0 flex-1 flex-col px-1 py-0.5">
        <div className="text-xs font-semibold leading-snug text-foreground">
          <span className="font-mono text-muted-foreground">#{issue.number}</span> {issue.title}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{issue.author}</span>
          <span aria-hidden>·</span>
          <span>{timeAgo(issue.updatedAt)}</span>
        </div>

        <div className="mt-2 flex-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('pr.view.description')}
          </span>
          {excerpt ? (
            <p
              className="mt-1 text-[11px] leading-relaxed text-foreground"
              data-testid="issue-hover-card-excerpt"
            >
              {excerpt}
            </p>
          ) : (
            <p className="mt-1 text-[11px] italic text-muted-foreground">
              {t('issue.view.noDescription')}
            </p>
          )}
        </div>

        <div className="mt-2 flex items-center gap-3 border-t border-border pt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {issue.comments}
          </span>
          {issue.thumbsUp > 0 && (
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" />
              {issue.thumbsUp}
            </span>
          )}
        </div>
      </div>

      {/* Right: the issue view's metadata column, read-only. */}
      <div className="w-40 shrink-0 border-l border-border" data-testid="issue-hover-card-meta">
        <PrSidebarSection title={t('issue.side.status')} testId="issue-hover-status">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isOpen
                ? 'border-success/30 bg-success/15 text-tone-success'
                : 'border-destructive/30 bg-destructive/15 text-tone-danger'
            }`}
          >
            {isOpen ? <CircleDot className="h-3 w-3" /> : <CircleCheck className="h-3 w-3" />}
            {isOpen ? t('sidebar.issueCard.open') : t('sidebar.issueCard.closed')}
          </span>
        </PrSidebarSection>

        <PrSidebarSection title={t('pr.side.assignees')} testId="issue-hover-assignees">
          <PrUserList
            // `Collaborator` and `GhUser` name the same thing with different keys — the list item
            // carries the former, the shared component speaks the latter.
            users={issue.assignees.map((a) => ({ login: a.login, avatar_url: a.avatar }))}
            emptyLabel="pr.side.noAssignees"
          />
        </PrSidebarSection>

        {/* Last section: no bottom divider needed, but `PrSidebarSection` draws one for every
            block — the column ends on it, which reads as the card's own edge. */}
        <PrSidebarSection title={t('pr.side.labels')} testId="issue-hover-labels">
          {issue.labels.length > 0 ? (
            <ul className="flex flex-wrap gap-1">
              {issue.labels.slice(0, MAX_LABELS).map((label) => (
                <li
                  key={label}
                  data-testid={`issue-hover-label-${label}`}
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-foreground"
                >
                  {label}
                </li>
              ))}
              {extraLabels > 0 && (
                <li className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  +{extraLabels}
                </li>
              )}
            </ul>
          ) : (
            <p className="text-xs italic text-muted-foreground">{t('pr.side.noLabels')}</p>
          )}
        </PrSidebarSection>
      </div>
    </div>
  )
}
