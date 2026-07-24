import { ChevronLeft, CircleDot, CircleCheck, ExternalLink } from 'lucide-react'
import { Spinner } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { PrComments } from '../pr/PrComments'
import { PrCommentBox } from '../pr/PrCommentBox'
import { IssueTitle } from './IssueTitle'
import { IssueDescription } from './IssueDescription'
import { IssueMetaSidebar } from './IssueMetaSidebar'
import { useIssueDetail } from '../../../hooks/useIssueDetail'
import { openUrl } from '../../../app/pull-requests/utils'
import type { MockIssue } from '../../../app/pull-requests/types'

interface IssueDetailCenterProps {
  /** `owner/repo` string — resolved by the panel's `RepoGitHubOverrideContext`. */
  repoPath: string
  issueNumber: number
  /** The Launchpad issue, forwarded to the sidebar for the local-branch section. */
  issue: MockIssue
  onClose: () => void
  /** Revalidate the Launchpad issue list after a state change (close/reopen). */
  onChanged?: () => void
}

/** In-app issue view: a two-column layout (GitHub-style) — the conversation (title, description,
 * comments + reply) and, on its right, the metadata sidebar (status, assignees, labels, branch).
 * The comment stack is reused from the PR components (shared `/issues/{n}` endpoints). */
export function IssueDetailCenter({
  repoPath,
  issueNumber,
  issue,
  onClose,
  onChanged,
}: IssueDetailCenterProps) {
  const { t } = useTranslation('git')
  const { issue: detail, isLoading } = useIssueDetail(repoPath, issueNumber)
  const isOpen = detail?.state === 'open'

  const issueUrl =
    issue.url ||
    detail?.html_url ||
    (repoPath.includes('/') ? `https://github.com/${repoPath}/issues/${issueNumber}` : undefined)

  return (
    <div data-testid="issue-detail-center" className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          onClick={onClose}
          data-testid="issue-detail-back"
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('issue.view.back')}
        </button>
        <CircleDot className="ml-1 h-3.5 w-3.5 text-primary" />
        <span className="text-xs text-muted-foreground">{t('issue.view.title')}</span>

        <button
          onClick={() => issueUrl && openUrl(issueUrl)}
          disabled={!issueUrl}
          data-testid="issue-open-github"
          title={t('issue.view.openOnGitHub')}
          aria-label={t('issue.view.openOnGitHub')}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>{t('issue.view.openOnGitHub')}</span>
        </button>
      </div>

      {isLoading || !detail ? (
        <div className="flex flex-1 items-center justify-center gap-2">
          <Spinner className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t('issue.view.loading')}</span>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="border-b border-border px-4 py-3">
              <IssueTitle repoPath={repoPath} issueNumber={issueNumber} title={detail.title} />
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isOpen
                      ? 'border-success/30 bg-success/15 text-tone-success'
                      : 'border-destructive/30 bg-destructive/15 text-tone-danger'
                  }`}
                >
                  {isOpen ? <CircleDot className="h-3 w-3" /> : <CircleCheck className="h-3 w-3" />}
                  {isOpen ? t('issue.view.stateOpen') : t('issue.view.stateClosed')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {detail.user?.login ?? '—'} · {new Date(detail.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            <IssueDescription
              repoPath={repoPath}
              issueNumber={issueNumber}
              body={detail.body ?? ''}
            />

            <PrComments repoPath={repoPath} prNumber={issueNumber} />
            <PrCommentBox repoPath={repoPath} prNumber={issueNumber} />
          </div>

          <div className="w-56 shrink-0 overflow-y-auto border-l border-border">
            <IssueMetaSidebar
              repoPath={repoPath}
              issueNumber={issueNumber}
              issue={issue}
              onChanged={onChanged}
            />
          </div>
        </div>
      )}
    </div>
  )
}
