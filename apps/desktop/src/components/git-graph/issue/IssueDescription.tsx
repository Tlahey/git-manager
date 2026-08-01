import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner, Textarea } from '@git-manager/ui'
import { Pencil } from 'lucide-react'
import { Markdown } from '../../Markdown'
import { useIssueEdit } from '../../../hooks/useIssueEdit'
import { useMarkdownTaskToggle } from '../../../hooks/useMarkdownTaskToggle'

interface IssueDescriptionProps {
  repoPath: string
  issueNumber: number
  body: string
}

/** The issue description: markdown body with an edit button that swaps in an inline textarea, saved
 * via `PATCH /issues/{n}`. Mirrors {@link PrDescription}. */
export function IssueDescription({ repoPath, issueNumber, body }: IssueDescriptionProps) {
  const { t } = useTranslation('git')
  const { update, pending, canEdit } = useIssueEdit(repoPath, issueNumber)
  const trimmed = body?.trim() ?? ''
  const [editing, setEditing] = useState(false)

  const saveBody = useCallback((next: string) => update({ body: next }), [update])
  const {
    content: shownBody,
    onTaskToggle,
    pending: togglePending,
  } = useMarkdownTaskToggle(trimmed, canEdit ? saveBody : null)

  const [draft, setDraft] = useState(trimmed)

  useEffect(() => {
    if (!editing) setDraft(shownBody)
  }, [shownBody, editing])

  async function save() {
    try {
      await update({ body: draft })
      setEditing(false)
    } catch {
      // Error surfaced by useIssueEdit; keep the editor open for a retry.
    }
  }

  return (
    <section data-testid="issue-description" className="border-b border-border px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('pr.view.description')}
        </span>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            data-testid="issue-description-edit"
            className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
            {t('pr.action.edit')}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            rows={8}
            className="text-xs"
            data-testid="issue-description-input"
            placeholder={t('pr.publish.descriptionPlaceholder')}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={pending}
              onClick={() => {
                setEditing(false)
                setDraft(shownBody)
              }}
            >
              {t('pr.title.cancel')}
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={pending}
              onClick={() => void save()}
              data-testid="issue-description-save"
            >
              {pending && <Spinner className="h-3 w-3" />}
              {t('pr.action.save')}
            </Button>
          </div>
        </div>
      ) : shownBody ? (
        <Markdown
          content={shownBody}
          onTaskToggle={onTaskToggle}
          taskTogglePending={togglePending}
        />
      ) : (
        <p className="text-xs italic text-muted-foreground">{t('issue.view.noDescription')}</p>
      )}
    </section>
  )
}
