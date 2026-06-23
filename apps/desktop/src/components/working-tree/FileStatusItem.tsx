import type { GitStatusEntry } from '@git-manager/git-types'
import { cn } from '@git-manager/ui'

interface FileStatusItemProps {
  entry: GitStatusEntry | string
  isUntracked?: boolean
  isStaged: boolean
  isSelected: boolean
  onClick: () => void
  onToggle: () => void
}

const STATUS_COLORS: Record<string, string> = {
  added: 'text-green-400',
  modified: 'text-yellow-400',
  deleted: 'text-red-400',
  renamed: 'text-blue-400',
  untracked: 'text-muted-foreground',
}

const STATUS_LABELS: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  untracked: '?',
}

export function FileStatusItem({
  entry,
  isUntracked = false,
  isStaged,
  isSelected,
  onClick,
  onToggle,
}: FileStatusItemProps) {
  const filePath = isUntracked ? (entry as string) : (entry as GitStatusEntry).path
  const statusKind = isUntracked ? 'untracked' : (entry as GitStatusEntry).status
  const statusLabel = STATUS_LABELS[statusKind] ?? 'M'
  const statusColor = STATUS_COLORS[statusKind] ?? 'text-muted-foreground'

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    onToggle()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-xs transition-colors',
        isSelected
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      {/* Checkbox stage/unstage */}
      <button
        onClick={handleToggle}
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-border transition-colors hover:border-foreground"
        aria-label={isStaged ? 'Unstage' : 'Stage'}
      >
        {isStaged && (
          <span className="block h-2 w-2 rounded-sm bg-primary" />
        )}
      </button>

      {/* Icône de statut */}
      <span className={cn('shrink-0 font-mono font-bold', statusColor)}>
        {statusLabel}
      </span>

      {/* Chemin tronqué */}
      <span className="min-w-0 flex-1 truncate font-mono">{filePath}</span>
    </div>
  )
}
