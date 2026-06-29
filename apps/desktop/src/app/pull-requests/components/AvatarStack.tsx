import type { Collaborator } from '../types'

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
        <img
          key={u.login}
          src={u.avatar}
          alt={u.login}
          title={u.login}
          className="rounded-full border border-border bg-muted object-cover"
          style={{ width: 18, height: 18 }}
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
