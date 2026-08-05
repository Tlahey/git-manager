import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, Spinner } from '@git-manager/ui'
import { Check, X } from 'lucide-react'

interface CardTitleFieldProps {
  title: string
  onSave: (title: string) => Promise<unknown>
  readOnly?: boolean
}

/**
 * The card's title: a heading that becomes an inline editor on click. Enter saves, Escape cancels.
 *
 * Mirrors `IssueTitle` so a card and an issue behave identically — the app already teaches this
 * gesture in the PR and issue views, and a card that needed a different one would be the odd view
 * out. An empty or unchanged title just closes the editor rather than writing.
 */
export function CardTitleField({ title, onSave, readOnly }: CardTitleFieldProps) {
  const { t } = useTranslation('board')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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
    setPending(true)
    try {
      await onSave(next)
      setEditing(false)
    } catch {
      // Reported by the action layer (`reportWriteFailures`); swallowed here so the rejection isn't
      // an unhandled one, and so the dialog stays open on what the user typed.
    } finally {
      setPending(false)
    }
  }

  function cancel() {
    setEditing(false)
    setDraft(title)
  }

  if (!editing) {
    return (
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setEditing(true)}
        title={readOnly ? undefined : t('card.title.edit')}
        data-testid="card-title-display"
        className="min-w-0 flex-1 cursor-pointer rounded px-1 py-0.5 text-left text-base font-semibold text-foreground transition-colors hover:enabled:bg-accent disabled:cursor-default"
      >
        {title}
      </button>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') cancel()
        }}
        disabled={pending}
        className="h-8 text-sm"
        data-testid="card-title-input"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={pending}
        title={t('card.description.save')}
        aria-label={t('card.description.save')}
        data-testid="card-title-save"
        className="cursor-pointer rounded p-1 text-muted-foreground hover:enabled:bg-accent hover:enabled:text-foreground disabled:opacity-50"
      >
        {pending ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        title={t('card.description.cancel')}
        aria-label={t('card.description.cancel')}
        data-testid="card-title-cancel"
        className="cursor-pointer rounded p-1 text-muted-foreground hover:enabled:bg-accent hover:enabled:text-foreground disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
