import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner, Textarea } from '@git-manager/ui'
import { Pencil } from 'lucide-react'
import { Markdown } from '../../Markdown'
import { usePrActions } from '../../../hooks/usePrActions'

interface PrDescriptionProps {
  repoPath: string
  prNumber: number
  body: string
}

/** The PR description: a caption label with an edit button, rendering the body as markdown and, on
 * edit, an inline textarea saved via `PATCH /pulls/{n}`. */
export function PrDescription({ repoPath, prNumber, body }: PrDescriptionProps) {
  const { t } = useTranslation('git')
  const { updatePr, pending } = usePrActions(repoPath, prNumber)
  const trimmed = body?.trim() ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(trimmed)

  useEffect(() => {
    if (!editing) setDraft(trimmed)
  }, [trimmed, editing])

  async function save() {
    try {
      await updatePr({ body: draft })
      setEditing(false)
    } catch {
      // Error surfaced by usePrActions; keep the editor open for a retry.
    }
  }

  return (
    <section data-testid="pr-description" className="border-t border-border px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('pr.view.description')}
        </span>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            data-testid="pr-description-edit"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
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
            data-testid="pr-description-input"
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
                setDraft(trimmed)
              }}
            >
              {t('pr.title.cancel')}
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={pending}
              onClick={() => void save()}
              data-testid="pr-description-save"
            >
              {pending && <Spinner className="h-3 w-3" />}
              {t('pr.action.save')}
            </Button>
          </div>
        </div>
      ) : trimmed ? (
        <Markdown content={trimmed} />
      ) : (
        <p className="text-xs italic text-muted-foreground">{t('pr.view.noDescription')}</p>
      )}
    </section>
  )
}
