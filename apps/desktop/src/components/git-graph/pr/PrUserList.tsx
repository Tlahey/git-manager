import { useTranslation } from '@git-manager/i18n'
import type { GhUser } from '../../../api/github.api'

interface PrUserListProps {
  users: GhUser[]
  /** Shown when there are no users (e.g. "No reviewers yet"). */
  emptyLabel: string
}

/** A compact row of GitHub users (avatar + login) for the PR side panel — reused for reviewers,
 * assignees and participants. */
export function PrUserList({ users, emptyLabel }: PrUserListProps) {
  const { t } = useTranslation('git')

  if (users.length === 0) {
    return <p className="text-xs italic text-muted-foreground">{t(emptyLabel)}</p>
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {users.map((u) => (
        <li key={u.login} className="flex items-center gap-1.5" data-testid={`pr-user-${u.login}`}>
          {u.avatar_url && <img src={u.avatar_url} alt={u.login} className="h-4 w-4 rounded-full" />}
          <span className="text-xs text-foreground">{u.login}</span>
        </li>
      ))}
    </ul>
  )
}
