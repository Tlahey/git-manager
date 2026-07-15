import { useTranslation } from '@git-manager/i18n'
import { Spinner } from '@git-manager/ui'
import {
  ChevronLeft,
  ExternalLink,
  GitPullRequest,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { usePrDetail } from '../../../hooks/usePrDetail'
import { apiOpenUrl } from '../../../api/shell.api'
import { PrTitle } from './PrTitle'
import { PrMeta } from './PrMeta'
import { PrDescription } from './PrDescription'
import { PrComments } from './PrComments'
import { PrMergePanel } from './PrMergePanel'
import { PrCommentBox } from './PrCommentBox'
import { PrMetaSidebar } from './PrMetaSidebar'

interface PrDetailCenterProps {
  repoPath: string
  prNumber: number
  onClose: () => void
}

/** Center panel while a PR is open — a two-column layout (GitHub-style): the conversation (id +
 * editable title, author/merge summary, editable description, comments, the merge box, a comment
 * composer) and, on the right of the content, the metadata sidebar (reviewers/assignees/labels/…).
 * The PR's changed files are a separate always-visible panel, not part of this view. */
export function PrDetailCenter({ repoPath, prNumber, onClose }: PrDetailCenterProps) {
  const { t } = useTranslation('git')
  const { pr, isLoading } = usePrDetail(repoPath, prNumber)
  const prFilesVisible = useRepoUIStore((s) => s.prFilesVisible)
  const togglePrFiles = useRepoUIStore((s) => s.togglePrFiles)

  return (
    <div data-testid="pr-detail-center" className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          onClick={onClose}
          data-testid="pr-detail-back"
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('pr.view.back')}
        </button>
        <GitPullRequest className="ml-1 h-3.5 w-3.5 text-primary" />
        <span className="text-xs text-muted-foreground">{t('pr.view.title')}</span>

        <div className="ml-auto flex items-center gap-1">
          {pr && (
            <button
              onClick={() => apiOpenUrl(pr.html_url)}
              data-testid="pr-detail-open-github"
              title={t('pr.view.openOnGithub')}
              className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={togglePrFiles}
            data-testid="pr-toggle-files"
            aria-pressed={prFilesVisible}
            title={prFilesVisible ? t('pr.files.hide') : t('pr.files.show')}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {prFilesVisible ? (
              <PanelRightClose className="h-3.5 w-3.5" />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {isLoading || !pr ? (
        <div className="flex flex-1 items-center justify-center gap-2">
          <Spinner className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t('pr.view.loading')}</span>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto">
            <PrTitle repoPath={repoPath} prNumber={prNumber} title={pr.title} />
            <PrMeta pr={pr} />
            <PrDescription repoPath={repoPath} prNumber={prNumber} body={pr.body ?? ''} />
            <PrComments repoPath={repoPath} prNumber={prNumber} />
            <PrMergePanel repoPath={repoPath} prNumber={prNumber} pr={pr} />
            <PrCommentBox repoPath={repoPath} prNumber={prNumber} />
          </div>
          <div className="w-56 shrink-0 overflow-y-auto border-l border-border">
            <PrMetaSidebar repoPath={repoPath} prNumber={prNumber} />
          </div>
        </div>
      )}
    </div>
  )
}
