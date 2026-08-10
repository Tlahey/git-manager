import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, Spinner, Tooltip } from '@git-manager/ui'
import { Check, X } from 'lucide-react'
import { useIssueEdit } from '../../../hooks/useIssueEdit'

interface IssueTitleProps {
  repoPath: string
  issueNumber: number
  title: string
}

/** The issue title heading (+ `#number`) that turns into an inline editor on click, saving via
 * `PATCH /issues/{n}`. Escape cancels, Enter (or the check) saves. Mirrors {@link PrTitle}. */
export function IssueTitle({ repoPath, issueNumber, title }: IssueTitleProps) {
  const { t } = useTranslation('git')
  const { update, pending, canEdit } = useIssueEdit(repoPath, issueNumber)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
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
    try {
      await update({ title: next })
      setEditing(false)
    } catch {
      // Error surfaced by useIssueEdit; keep the editor open for a retry.
    }
  }

  function cancel() {
    setEditing(false)
    setDraft(title)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={pending}
          data-testid="issue-title-input"
          className="h-8 text-sm font-semibold"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') cancel()
          }}
        />
        <Tooltip content={t('pr.title.save')}>
          <button
            onClick={() => void save()}
            disabled={pending}
            data-testid="issue-title-save"
            className="cursor-pointer rounded p-1 text-green-500 hover:enabled:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('pr.title.save')}
          >
            {pending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          </button>
        </Tooltip>
        <Tooltip content={t('pr.title.cancel')}>
          <button
            onClick={cancel}
            disabled={pending}
            className="cursor-pointer rounded p-1 text-muted-foreground hover:enabled:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('pr.title.cancel')}
          >
            <X className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
    )
  }

  return (
    <h2
      onClick={canEdit ? () => setEditing(true) : undefined}
      data-testid="issue-title"
      title={canEdit ? t('pr.title.editHint') : undefined}
      aria-label={canEdit ? t('pr.title.editHint') : undefined}
      className={`text-sm font-semibold wrap-anywhere ${canEdit ? 'cursor-text hover:opacity-80' : ''}`}
    >
      <span className="text-foreground">{title}</span>{' '}
      <span className="font-mono text-xs font-normal whitespace-nowrap text-muted-foreground/60">
        #{issueNumber}
      </span>
    </h2>
  )
}
