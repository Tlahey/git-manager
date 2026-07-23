import { useState } from 'react'
import { ChevronLeft, CircleDot, CircleCheck, Loader2 } from 'lucide-react'
import { Spinner, Button, toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { Markdown } from '../../Markdown'
import { PrComments } from '../pr/PrComments'
import { PrCommentBox } from '../pr/PrCommentBox'
import { useIssueDetail } from '../../../hooks/useIssueDetail'
import { useRepoGitHub } from '../../../hooks/useRepoGitHub'
import { setIssueState } from '../../../api/github.api'

interface IssueDetailCenterProps {
  /** `owner/repo` string — resolved by the panel's `RepoGitHubOverrideContext`. */
  repoPath: string
  issueNumber: number
  onClose: () => void
  /** Revalidate the Launchpad issue list after a state change (close/reopen). */
  onChanged?: () => void
}

/** In-app issue view: header, description (markdown), the conversation + reply (reused from the PR
 * components — they target the shared `/issues/{n}` endpoints), and a Close/Reopen action. */
export function IssueDetailCenter({
  repoPath,
  issueNumber,
  onClose,
  onChanged,
}: IssueDetailCenterProps) {
  const { t } = useTranslation('git')
  const { issue, isLoading, refresh } = useIssueDetail(repoPath, issueNumber)
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const [busy, setBusy] = useState(false)

  const isOpen = issue?.state === 'open'

  async function toggleState() {
    if (!ownerRepo || !token || !issue) return
    setBusy(true)
    try {
      await setIssueState(ownerRepo.owner, ownerRepo.repo, issueNumber, isOpen ? 'closed' : 'open', token)
      refresh()
      onChanged?.()
      toast.success(isOpen ? t('issue.view.closed') : t('issue.view.reopened'))
    } catch (e) {
      toast.error(t('issue.view.stateFailed'), { description: String(e) })
    } finally {
      setBusy(false)
    }
  }

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
      </div>

      {isLoading || !issue ? (
        <div className="flex flex-1 items-center justify-center gap-2">
          <Spinner className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t('issue.view.loading')}</span>
        </div>
      ) : (
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold [overflow-wrap:anywhere]">
              <span className="text-foreground">{issue.title}</span>{' '}
              <span className="whitespace-nowrap font-mono text-xs font-normal text-muted-foreground/60">
                #{issue.number}
              </span>
            </h2>
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
                {issue.user?.login ?? '—'} · {new Date(issue.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="border-b border-border px-4 py-3 text-xs">
            {issue.body ? (
              <Markdown content={issue.body} />
            ) : (
              <p className="italic text-muted-foreground">{t('issue.view.noDescription')}</p>
            )}
          </div>

          <PrComments repoPath={repoPath} prNumber={issueNumber} />

          {ownerRepo && token && (
            <div className="border-t border-border px-4 py-3">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={busy}
                onClick={toggleState}
                data-testid="issue-toggle-state"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isOpen ? (
                  <CircleCheck className="h-3.5 w-3.5" />
                ) : (
                  <CircleDot className="h-3.5 w-3.5" />
                )}
                {isOpen ? t('issue.view.close') : t('issue.view.reopen')}
              </Button>
            </div>
          )}

          <PrCommentBox repoPath={repoPath} prNumber={issueNumber} />
        </div>
      )}
    </div>
  )
}
