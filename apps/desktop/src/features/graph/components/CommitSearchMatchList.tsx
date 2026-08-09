import { useTranslation } from '@git-manager/i18n'
import { FileText } from 'lucide-react'
import type { StoredSearchMatch } from '../../../stores/aiCommitSearch.store'
import { formatRelativeTime } from '../../../lib/relativeDate'

interface CommitSearchMatchListProps {
  matches: StoredSearchMatch[]
  /** Selects the commit in the graph, so its diff opens in the usual place. */
  onOpenCommit: (oid: string) => void
}

/**
 * The commits a search found, each with what the model said about it and the files that carry it.
 *
 * This list is the answer's evidence, and it is why the panel does not stop at the prose. A model
 * that says "yes, twice, in June" is only useful if the next click gets you to those two commits —
 * so every row selects the commit in the graph, where the diff already opens the way it always does.
 * The matches are stored with the run for the same reason: an answer whose evidence has been thrown
 * away is a claim.
 */
export function CommitSearchMatchList({ matches, onOpenCommit }: CommitSearchMatchListProps) {
  const { t, i18n } = useTranslation('git')

  if (matches.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5" data-testid="commit-search-matches">
      <h4 className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {t('gitTree.commitSearch.matchesTitle', { count: matches.length })}
      </h4>

      {matches.map((match) => (
        <button
          key={match.oid}
          type="button"
          onClick={() => onOpenCommit(match.oid)}
          aria-label={t('gitTree.commitSearch.viewCommit', { sha: match.shortOid })}
          className="flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded-md border border-border bg-muted/20 px-2 py-1.5 text-left transition-colors hover:border-primary/50 hover:bg-accent"
          data-testid={`commit-search-match-${match.shortOid}`}
        >
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 font-mono text-[10px] font-semibold text-primary">
              {match.shortOid}
            </span>
            <span className="truncate text-xs text-foreground">{match.subject}</span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(match.timestamp, i18n.language)} · {match.author}
          </span>
          <span className="text-[11px] text-foreground/90">{match.finding}</span>
          {match.files.length > 0 && (
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              {match.files.map((file) => (
                <span
                  key={file}
                  className="flex max-w-full min-w-0 items-center gap-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground"
                >
                  <FileText className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{file}</span>
                </span>
              ))}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
