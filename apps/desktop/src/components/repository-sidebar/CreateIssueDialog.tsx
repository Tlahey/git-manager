import { useState } from 'react'
import {
  Button,
  Spinner,
  Input,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { createIssue } from '../../api/github.api'
import { useRepoGitHub } from '../../hooks/useRepoGitHub'
import { useGithubMediaDropHandler } from '../../hooks/useGithubMediaDropHandler'

interface CreateIssueDialogProps {
  repoPath: string
  open: boolean
  onClose: () => void
  /** Revalidate the sidebar's issue list so the new issue appears without waiting for the poll. */
  onCreated?: () => void
}

/**
 * Opens a new GitHub issue on the repo currently in the sidebar, without leaving the app.
 *
 * Only the title and body are offered: labels and assignees need their own pickers (and the repo's
 * label/collaborator lists), which is the issue *editor*'s job — this dialog exists so filing a
 * thought mid-work costs one keystroke, not a context switch to the browser.
 */
export function CreateIssueDialog({ repoPath, open, onClose, onCreated }: CreateIssueDialogProps) {
  const { t } = useTranslation('git')
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const newIssueUrl = ownerRepo ? `https://github.com/${ownerRepo.owner}/${ownerRepo.repo}/issues/new` : null
  const mediaDrop = useGithubMediaDropHandler(newIssueUrl)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = title.trim().length > 0 && !!ownerRepo && !!token && !isSubmitting

  function reset() {
    setTitle('')
    setBody('')
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset()
      onClose()
    }
  }

  async function handleSubmit() {
    if (!canSubmit || !ownerRepo || !token) return
    setIsSubmitting(true)
    setError(null)
    try {
      await createIssue(ownerRepo.owner, ownerRepo.repo, { title: title.trim(), body }, token)
      onCreated?.()
      reset()
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="issue-create-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('sidebar.createIssue.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {ownerRepo ? (
            <p className="text-[11px] text-muted-foreground">
              {t('sidebar.createIssue.target', { repo: `${ownerRepo.owner}/${ownerRepo.repo}` })}
            </p>
          ) : (
            <p className="text-xs text-destructive" data-testid="issue-create-no-github">
              {t('sidebar.issues.noGithub')}
            </p>
          )}

          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="issue-create-title">
              {t('sidebar.createIssue.titleLabel')}
            </label>
            <Input
              id="issue-create-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('sidebar.createIssue.titlePlaceholder')}
              data-testid="issue-create-title-input"
              disabled={!ownerRepo}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit()
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground" htmlFor="issue-create-body">
              {t('sidebar.createIssue.bodyLabel')}
            </label>
            <Textarea
              id="issue-create-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onDragOver={mediaDrop.onDragOver}
              onDrop={mediaDrop.onDrop}
              placeholder={t('sidebar.createIssue.bodyPlaceholder')}
              data-testid="issue-create-body-input"
              disabled={!ownerRepo}
              rows={6}
            />
          </div>

          {!token && ownerRepo && (
            <p className="text-xs text-destructive" data-testid="issue-create-no-token">
              {t('sidebar.createIssue.noToken')}
            </p>
          )}
          {error && (
            <p className="text-xs text-destructive" data-testid="issue-create-error">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('gitTree.contextMenu.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="gap-1.5"
            data-testid="issue-create-confirm-button"
          >
            {isSubmitting && <Spinner className="h-3 w-3" />}
            {t('sidebar.createIssue.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
