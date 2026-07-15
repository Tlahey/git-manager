import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, Spinner } from '@git-manager/ui'
import { Check, X } from 'lucide-react'
import { usePrActions } from '../../../hooks/usePrActions'

interface PrTitleProps {
  repoPath: string
  prNumber: number
  title: string
}

/** PR id (gray caption) + the title as a heading that turns into an inline editor on click, saving
 * the new title via `PATCH /pulls/{n}`. Escape cancels, Enter (or the check) saves. */
export function PrTitle({ repoPath, prNumber, title }: PrTitleProps) {
  const { t } = useTranslation('git')
  const { updatePr, pending } = usePrActions(repoPath, prNumber)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the local draft in sync when the PR (or its upstream title) changes while not editing.
  useEffect(() => {
    if (!editing) setDraft(title)
  }, [title, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function save() {
    const next = draft.trim()
    if (!next || next === title) {
      setEditing(false)
      setDraft(title)
      return
    }
    try {
      await updatePr({ title: next })
      setEditing(false)
    } catch {
      // usePrActions surfaces the error; keep the editor open so the user can retry.
    }
  }

  function cancel() {
    setEditing(false)
    setDraft(title)
  }

  return (
    <div className="px-4 pt-3">
      <span className="text-xs font-medium text-muted-foreground" data-testid="pr-title-number">
        #{prNumber}
      </span>
      {editing ? (
        <div className="mt-1 flex items-center gap-2">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            data-testid="pr-title-input"
            className="h-9 text-lg font-semibold"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') cancel()
            }}
          />
          <button
            onClick={() => void save()}
            disabled={pending}
            data-testid="pr-title-save"
            className="rounded p-1.5 text-green-500 hover:bg-accent disabled:opacity-50"
            title={t('pr.title.save')}
          >
            {pending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            onClick={cancel}
            disabled={pending}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
            title={t('pr.title.cancel')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <h1
          onClick={() => setEditing(true)}
          data-testid="pr-title"
          title={t('pr.title.editHint')}
          className="mt-0.5 cursor-text text-xl font-semibold leading-tight text-foreground hover:opacity-80"
        >
          {title}
        </h1>
      )}
    </div>
  )
}
