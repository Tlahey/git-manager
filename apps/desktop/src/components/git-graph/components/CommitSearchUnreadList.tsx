import type { ScanFailure, ScannedCommit } from '@git-manager/ai'
import { useTranslation } from '@git-manager/i18n'
import { Tooltip } from '@git-manager/ui'
import { AlertTriangle } from 'lucide-react'

interface CommitSearchUnreadListProps {
  /** The commits the scan could not read, in the order they were reached. */
  unread: ScannedCommit[]
  /** Selects the commit in the graph, so it can be read by hand. */
  onOpenCommit: (oid: string) => void
}

/** One sentence per cause, saying what happened and what to do about it. */
const FAILURE_KEYS: Record<ScanFailure, string> = {
  unreadable: 'gitTree.commitSearch.unread.unreadable',
  timeout: 'gitTree.commitSearch.unread.timeout',
  call: 'gitTree.commitSearch.unread.call',
  diff: 'gitTree.commitSearch.unread.diff',
}

/**
 * The commits that went unread, named rather than counted.
 *
 * This replaces a line that said "N commits could not be read" and nothing else — true, alarming,
 * and impossible to act on. The user could not tell which commits were missing from the answer, nor
 * whether their provider was down, too slow, or answering in a shape the app cannot parse. Those
 * have completely different fixes, and only the last one is common (a model that ignores the
 * requested JSON format fails every commit identically, which is what a wall of these means).
 *
 * Each row opens the commit, because reading the three the model dropped is usually faster than
 * running the search again.
 */
export function CommitSearchUnreadList({ unread, onOpenCommit }: CommitSearchUnreadListProps) {
  const { t } = useTranslation('git')

  if (unread.length === 0) return null

  // Grouped by cause: a run where every commit failed the same way is one problem, not twenty.
  const causes = [...new Set(unread.map((r) => r.failure ?? 'call'))]

  return (
    <div className="flex flex-col gap-1.5" data-testid="commit-search-unread">
      <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-tone-warning">
        <AlertTriangle className="h-3 w-3" />
        {t('gitTree.commitSearch.unread.title', { count: unread.length })}
      </h4>

      {causes.map((cause) => (
        <p key={cause} className="text-[10px] text-muted-foreground">
          {t(FAILURE_KEYS[cause])}
        </p>
      ))}

      <p className="text-[10px] text-muted-foreground">
        {t('gitTree.commitSearch.unread.consequence')}
      </p>

      <div className="flex flex-wrap gap-1">
        {unread.map((result) => (
          <Tooltip key={result.commit.oid} content={result.commit.subject}>
            <button
              type="button"
              onClick={() => onOpenCommit(result.commit.oid)}
              aria-label={t('gitTree.commitSearch.viewCommit', { sha: result.commit.shortOid })}
              className="flex max-w-full items-center gap-1 rounded border border-border bg-muted/20 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              data-testid={`commit-search-unread-${result.commit.shortOid}`}
            >
              {result.commit.shortOid}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
