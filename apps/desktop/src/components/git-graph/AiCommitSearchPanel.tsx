import { useCallback, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Progress, ScrollArea, Spinner } from '@git-manager/ui'
import { Search, X } from 'lucide-react'
import {
  DEFAULT_MAX_SCANNED_COMMITS,
  DEFAULT_SEARCH_WINDOW_HOURS,
  useAiCommitSearch,
} from '../../hooks/useAiCommitSearch'
import type { StoredSearchMatch, StoredSearchRun } from '../../stores/aiCommitSearch.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { aiErrorMessage } from '../../lib/aiErrorMessage'
import { Markdown } from '../Markdown'
import { CommitSearchForm } from './components/CommitSearchForm'
import { CommitSearchHistoryList } from './components/CommitSearchHistoryList'
import { CommitSearchMatchList } from './components/CommitSearchMatchList'

interface AiCommitSearchPanelProps {
  repoPath: string
  onClose: () => void
}

/**
 * Ask a question about what happened in this repository lately, answered by reading its commits.
 *
 * The panel is deliberately not shaped like the explanation panels, which take a subject and produce
 * a summary of it. Here the *question* is the input, the answer is one artifact among several, and
 * the rest — which commits were read, which ones matched, what each of them did — is the part the
 * user acts on. So this owns its own chrome rather than reusing `ExplanationPanelShell`: it needs a
 * form, live per-commit results, and a history, none of which that shell has a place for.
 *
 * It shows either the run in progress (or just finished) or a saved one the user reopened; the
 * saved run wins while it is open, and any new search drops back to the live view.
 */
export function AiCommitSearchPanel({ repoPath, onClose }: AiCommitSearchPanelProps) {
  const { t } = useTranslation('git')
  const { t: tErrors } = useTranslation('errors')
  const search = useAiCommitSearch(repoPath)

  const [question, setQuestion] = useState('')
  const [sinceHours, setSinceHours] = useState<number>(DEFAULT_SEARCH_WINDOW_HOURS)
  const [maxCommits, setMaxCommits] = useState(DEFAULT_MAX_SCANNED_COMMITS)
  /** A saved run the user reopened, shown instead of the live one until they search again. */
  const [viewedRun, setViewedRun] = useState<StoredSearchRun | null>(null)

  const openCommit = useCallback((oid: string) => {
    // The graph already knows how to select a commit and open its diff — this only points at one.
    useRepoUIStore.getState().setPendingGraphSelection(oid)
  }, [])

  const runSearch = useCallback(() => {
    setViewedRun(null)
    void search.search(question, { sinceHours, maxCommits })
  }, [search, question, sinceHours, maxCommits])

  const liveMatches: StoredSearchMatch[] = search.matches.map((m) => ({
    oid: m.commit.oid,
    shortOid: m.commit.shortOid,
    subject: m.commit.subject,
    author: m.commit.author,
    timestamp: m.commit.timestamp,
    finding: m.finding,
    files: m.files,
  }))

  const shown = viewedRun
    ? {
        question: viewedRun.question,
        answer: viewedRun.answer,
        matches: viewedRun.matches,
        scanned: viewedRun.scanned,
        failed: viewedRun.failed,
        truncated: viewedRun.truncated,
      }
    : {
        question: search.askedQuestion,
        answer: search.answer,
        matches: liveMatches,
        scanned: search.results.length,
        failed: search.failedCount,
        truncated: search.truncated,
      }

  const progress = search.progress
  const hasAnswer = shown.answer.trim().length > 0

  return (
    <div
      data-testid="ai-commit-search-panel"
      className="flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-border bg-card shadow-2xl"
    >
      <div className="flex flex-col gap-2.5 border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Search className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{t('gitTree.commitSearch.panelTitle')}</span>
          </h3>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t('actions.close')}
            data-testid="commit-search-close-panel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <CommitSearchForm
          question={question}
          onQuestionChange={setQuestion}
          sinceHours={sinceHours}
          onSinceHoursChange={setSinceHours}
          maxCommits={maxCommits}
          onMaxCommitsChange={setMaxCommits}
          isRunning={search.isRunning}
          onSubmit={runSearch}
          onCancel={() => void search.cancel()}
        />

        {progress?.phase === 'scanning' && (
          <div className="space-y-1" data-testid="commit-search-progress">
            <p className="text-[10px] text-muted-foreground">
              {t('gitTree.commitSearch.scanning', {
                done: progress.completed,
                total: progress.total,
              })}
            </p>
            <Progress
              value={Math.round((progress.completed / Math.max(1, progress.total)) * 100)}
            />
          </div>
        )}
        {progress?.phase === 'composing' && (
          <p className="text-[10px] text-muted-foreground" data-testid="commit-search-composing">
            {t('gitTree.commitSearch.composing')}
          </p>
        )}
      </div>

      <ScrollArea className="w-full min-w-0 flex-1">
        <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-4">
          {shown.question && (
            <p className="text-[11px] italic text-muted-foreground" data-testid="commit-search-asked">
              {t('gitTree.commitSearch.asked', { question: shown.question })}
            </p>
          )}

          {search.phase === 'error' && (
            <p className="break-words text-xs text-tone-danger" data-testid="commit-search-error">
              {aiErrorMessage(search.error ?? '', tErrors)}
            </p>
          )}

          {search.phase === 'cancelled' && !hasAnswer && (
            <p className="text-xs text-muted-foreground" data-testid="commit-search-cancelled">
              {t('gitTree.commitSearch.cancelled')}
            </p>
          )}

          {hasAnswer ? (
            <Markdown content={shown.answer} repoPath={repoPath} className="text-xs" />
          ) : search.isRunning ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="h-3.5 w-3.5" />
              {t('gitTree.commitSearch.working')}
            </div>
          ) : (
            search.phase === 'idle' &&
            !viewedRun && (
              <p className="text-xs text-muted-foreground" data-testid="commit-search-empty">
                {t('gitTree.commitSearch.empty')}
              </p>
            )
          )}

          {/* Both notices qualify a "no": a commit that could not be read said nothing, and a
              truncated window is not an exhausted one. */}
          {shown.failed > 0 && (
            <p className="text-[10px] text-tone-warning" data-testid="commit-search-failed">
              {t('gitTree.commitSearch.failedNotice', { count: shown.failed })}
            </p>
          )}
          {shown.truncated && (
            <p className="text-[10px] text-tone-warning" data-testid="commit-search-truncated">
              {t('gitTree.commitSearch.truncatedNotice')}
            </p>
          )}

          {shown.matches.length === 0 && hasAnswer && (
            <p className="text-[10px] text-muted-foreground" data-testid="commit-search-no-matches">
              {t('gitTree.commitSearch.noMatches', { scanned: shown.scanned })}
            </p>
          )}

          <CommitSearchMatchList matches={shown.matches} onOpenCommit={openCommit} />

          <CommitSearchHistoryList
            runs={search.history}
            activeRunId={viewedRun?.id ?? null}
            onOpen={setViewedRun}
            onRemove={(id) => {
              if (viewedRun?.id === id) setViewedRun(null)
              search.removeRun(repoPath, id)
            }}
            onClearAll={() => {
              setViewedRun(null)
              search.clearHistory(repoPath)
            }}
          />
        </div>
      </ScrollArea>
    </div>
  )
}
