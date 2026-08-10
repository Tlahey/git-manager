import { CommitAvatar } from '../../../components/common/CommitAvatar'
import type { Collaborator } from '../../../lib/github/types'

interface AvatarStackProps {
  users: Collaborator[]
  max?: number
}

export function AvatarStack({ users, max = 3 }: AvatarStackProps) {
  const shown = users.slice(0, max)
  const extra = users.length - max

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((u) => (
        // Coloured initials for a collaborator GitHub gives no picture for, rather than the
        // broken-image glyph a bare <img src=""> renders. Same fallback as the graph's avatars.
        <CommitAvatar
          key={u.login}
          avatarUrl={u.avatar}
          name={u.login}
          title={u.login}
          size={18}
          className="border border-border"
        />
      ))}
      {extra > 0 && (
        <span
          className="flex items-center justify-center rounded-full border border-border bg-muted text-[8px] text-muted-foreground"
          style={{ width: 18, height: 18 }}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}
