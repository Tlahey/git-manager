import { CheckCircle2, Circle, GitMerge, XCircle, Loader2, ExternalLink } from 'lucide-react'
import type { PullRequest } from '@git-manager/git-types'
import { HoverExpandLabel } from './HoverExpandLabel'

interface PullRequestItemProps {
  pr: PullRequest
  onOpen?: (pr: PullRequest) => void
  isSelected?: boolean
}

const STATE_STYLES: Record<string, string> = {
  open: 'bg-green-500/15 text-green-400 border-green-500/30',
  draft: 'bg-muted text-muted-foreground border-border',
  merged: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  closed: 'bg-destructive/15 text-destructive border-destructive/30',
}

const STATE_LABELS: Record<string, string> = {
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed',
}

function CiIcon({ status }: { status: PullRequest['ciStatus'] }) {
  if (!status) return null
  if (status === 'success') return <CheckCircle2 className="h-3 w-3 text-green-400" />
  if (status === 'failure') return <XCircle className="h-3 w-3 text-red-400" />
  return <Loader2 className="h-3 w-3 animate-spin text-orange-400" />
}

export function PullRequestItem({ pr, onOpen, isSelected = false }: PullRequestItemProps) {
  return (
    <div
      className={`group/pr relative flex cursor-pointer items-start gap-2 py-1.5 pl-6 pr-2 transition-colors ${
        isSelected ? 'bg-accent font-medium text-foreground' : 'hover:bg-accent/60'
      }`}
      onClick={() => onOpen?.(pr)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen?.(pr)}
    >
      {/* Icône état */}
      <div className="mt-0.5 shrink-0">
        {pr.state === 'merged' ? (
          <GitMerge className="h-3.5 w-3.5 text-purple-400" />
        ) : (
          <Circle
            className={`h-3.5 w-3.5 ${
              pr.state === 'open' ? 'fill-green-400 text-green-400' : 'text-muted-foreground'
            }`}
          />
        )}
      </div>

      {/* Contenu */}
      <div className="min-w-0 flex-1">
        {/* Titre avec hover-expand */}
        <HoverExpandLabel
          className={`text-xs ${isSelected ? 'font-medium text-foreground' : 'text-foreground'}`}
        >
          #{pr.number} {pr.title}
        </HoverExpandLabel>

        {/* Méta */}
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded border px-1 py-px text-[9px] font-medium ${
              STATE_STYLES[pr.state] ?? STATE_STYLES.open
            }`}
          >
            {STATE_LABELS[pr.state] ?? pr.state}
          </span>
          <span className="text-[10px] text-muted-foreground">{pr.author}</span>
          <CiIcon status={pr.ciStatus} />
        </div>
      </div>

      {/* Lien externe au hover */}
      <a
        href={pr.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 opacity-0 transition-opacity group-hover/pr:opacity-100"
        aria-label="Ouvrir dans GitHub"
      >
        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
      </a>
    </div>
  )
}
