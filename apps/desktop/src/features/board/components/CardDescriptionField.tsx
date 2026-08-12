import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import { Markdown } from '../../../components/Markdown'
import { AttachmentTextarea } from './AttachmentTextarea'
import { CardContentSection } from './CardContentSection'

interface CardDescriptionFieldProps {
  description: string
  onSave: (description: string) => Promise<unknown>
  repoPath: string
  attachmentUrlPrefix?: string
  readOnly?: boolean
}

/**
 * The card's description: rendered markdown that swaps in an editor on demand.
 *
 * Mirrors `IssueDescription` — same read-then-edit gesture, same Save/Cancel pair — so the card
 * reads like the rest of the app. The editor is `AttachmentTextarea` rather than a plain one, which
 * is what keeps paste-an-image working here; and the rendered view passes `authored`, so a video
 * the user attached actually plays (the strict schema used for other people's markdown drops it).
 */
export function CardDescriptionField({
  description,
  onSave,
  repoPath,
  attachmentUrlPrefix,
  readOnly,
}: CardDescriptionFieldProps) {
  const { t } = useTranslation('board')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(description)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(description)
  }, [description, editing])

  async function save() {
    setPending(true)
    try {
      await onSave(draft)
      setEditing(false)
    } catch {
      // Reported by the action layer (`reportWriteFailures`); swallowed here so the rejection isn't
      // an unhandled one, and so the dialog stays open on what the user typed.
    } finally {
      setPending(false)
    }
  }

  return (
    <CardContentSection
      title={t('card.description.label')}
      sectionKey="card-description"
      testId="card-description-section"
    >
      {editing ? (
        <div className="space-y-2">
          <AttachmentTextarea
            value={draft}
            onChange={setDraft}
            repoPath={repoPath}
            attachmentUrlPrefix={attachmentUrlPrefix}
            placeholder={t('card.dialog.descriptionPlaceholder')}
            rows={4}
            autoGrow
            disabled={pending}
            className="text-xs"
            data-testid="card-description-input"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={pending}
              onClick={() => {
                setEditing(false)
                setDraft(description)
              }}
              data-testid="card-description-cancel"
            >
              {t('card.description.cancel')}
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={pending}
              onClick={() => void save()}
              data-testid="card-description-save"
            >
              {pending && <Spinner className="h-3 w-3" />}
              {t('card.description.save')}
            </Button>
          </div>
        </div>
      ) : (
        /* Clicking the text edits it, like the title — no pencil to aim for. The guard matters:
           the rendered markdown holds links, checkboxes and media, and swallowing those clicks
           would make a link in a description impossible to follow. */
        <div
          role={readOnly ? undefined : 'button'}
          tabIndex={readOnly ? undefined : 0}
          onClick={(e) => {
            if (readOnly) return
            if ((e.target as HTMLElement).closest('a, input, button, video, img')) return
            setEditing(true)
          }}
          onKeyDown={(e) => {
            if (!readOnly && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
              e.preventDefault()
              setEditing(true)
            }
          }}
          title={readOnly ? undefined : t('card.description.edit')}
          data-testid="card-description-display"
          className={`rounded ${readOnly ? '' : 'cursor-text hover:bg-accent/40'}`}
        >
          {description.trim() ? (
            <Markdown content={description} repoPath={repoPath} authored />
          ) : (
            <p
              className="text-xs text-muted-foreground italic"
              data-testid="card-description-empty"
            >
              {t('card.description.empty')}
            </p>
          )}
        </div>
      )}
    </CardContentSection>
  )
}
