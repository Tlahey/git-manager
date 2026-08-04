import { useMemo, useRef, useState, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, Spinner } from '@git-manager/ui'
import { Check, UserPlus, X } from 'lucide-react'
import { useAssignableUsers } from '../../../hooks/usePrEditCandidates'

interface CardAssigneeFieldProps {
  /** The stored value — a GitHub login when one matched, otherwise a plain name. */
  assignee?: string
  onChange: (assignee: string | null) => Promise<unknown> | void
  repoPath: string
  onClose: () => void
}

/**
 * Picks the single person responsible for a card.
 *
 * Shaped like `PrEditPopover` — search field, rows with avatars — but with two differences that made
 * a sibling component the honest choice rather than widening that one: it is **single**-select, and
 * it accepts a **name that is not a GitHub user**.
 *
 * That second point is the requirement: a board can live in a repository with no connected GitHub
 * account, where there is no user directory to pick from at all. So the collaborators are offered
 * when they exist, and a typed name that matches none of them is offered explicitly as itself —
 * never silently discarded for failing to be a login.
 */
export function CardAssigneeField({
  assignee,
  onChange,
  repoPath,
  onClose,
}: CardAssigneeFieldProps) {
  const { t } = useTranslation('board')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { users, isLoading } = useAssignableUsers(repoPath, true)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((user) => user.login.toLowerCase().includes(q))
  }, [users, query])

  const typed = query.trim()
  // Offered only when it isn't already one of the rows above — otherwise the same name would appear
  // twice, once as a GitHub user and once as "use it as a name", which are the same outcome here.
  const showFreeText =
    typed.length > 0 && !users.some((u) => u.login.toLowerCase() === typed.toLowerCase())

  async function pick(next: string | null) {
    setPending(true)
    try {
      await onChange(next)
      onClose()
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className="mt-1.5 rounded border border-border bg-popover p-1.5 shadow-md"
      data-testid="card-assignee-field"
    >
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && showFreeText) void pick(typed)
        }}
        placeholder={t('card.assignee.searchPlaceholder')}
        disabled={pending}
        inputSize="sm"
        className="mb-1.5"
        data-testid="card-assignee-search"
      />

      <div className="max-h-52 overflow-y-auto">
        {isLoading && (
          <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-muted-foreground">
            <Spinner className="h-3 w-3" />
          </p>
        )}

        {assignee && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void pick(null)}
            data-testid="card-assignee-clear"
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:enabled:bg-accent"
          >
            <X className="h-3 w-3 shrink-0" />
            {t('card.assignee.clear')}
          </button>
        )}

        {matches.map((user) => (
          <button
            key={user.login}
            type="button"
            disabled={pending}
            onClick={() => void pick(user.login)}
            data-testid={`card-assignee-option-${user.login}`}
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-foreground hover:enabled:bg-accent"
          >
            <img src={user.avatar_url} alt="" className="h-4 w-4 shrink-0 rounded-full" />
            <span className="min-w-0 flex-1 truncate">{user.login}</span>
            {assignee === user.login && <Check className="h-3 w-3 shrink-0 text-primary" />}
          </button>
        ))}

        {showFreeText && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void pick(typed)}
            data-testid="card-assignee-use-name"
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-foreground hover:enabled:bg-accent"
          >
            <UserPlus className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {t('card.assignee.useName', { name: typed })}
            </span>
          </button>
        )}

        {!isLoading && matches.length === 0 && !showFreeText && (
          <p
            className="px-2 py-3 text-center text-[11px] text-muted-foreground"
            data-testid="card-assignee-no-match"
          >
            {t('card.assignee.noMatch')}
          </p>
        )}
      </div>
    </div>
  )
}
