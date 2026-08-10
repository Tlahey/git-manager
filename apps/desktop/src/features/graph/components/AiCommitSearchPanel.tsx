import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { formatShortDate } from '../../../lib/relativeDate'
import { Button, Progress, ScrollArea, Spinner } from '@git-manager/ui'
import { Search, X } from 'lucide-react'
import {
  DEFAULT_MAX_SCANNED_COMMITS,
  dominantFailure,
  useAiCommitSearch,
} from '../../../hooks/useAiCommitSearch'
import { useNotchOperation } from '../../../hooks/useNotchOperation'
import { useWindowFocus } from '../../../hooks/useWindowFocus'
import {
  commitSearchNotchId,
  commitSearchNotchModel,
} from '../../../lib/notifications/commitSearchNotch'
import type { StoredSearchMatch, StoredSearchRun } from '../../../stores/aiCommitSearch.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { aiErrorMessage } from '../../../lib/aiErrorMessage'
import { Markdown } from '../../../components/Markdown'
import { CommitSearchForm } from './CommitSearchForm'
import { CommitSearchHistoryList } from './CommitSearchHistoryList'
import { CommitSearchMatchList } from './CommitSearchMatchList'
import { CommitSearchUnreadList } from './CommitSearchUnreadList'

/** The oldest date a run reached, or an em dash for a run saved before the span was recorded. */
function formatReadDate(epochSeconds: number | undefined, locale: string): string {
  if (epochSeconds === undefined) return '—'
  return formatShortDate(epochSeconds, locale)
}

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
  const { t, i18n } = useTranslation('git')
  const { t: tErrors } = useTranslation('errors')
  const search = useAiCommitSearch(repoPath)

  const [question, setQuestion] = useState('')
  const [maxCommits, setMaxCommits] = useState(DEFAULT_MAX_SCANNED_COMMITS)
  /**
   * Read the messages only, in one call, instead of every commit's diff.
   *
   * Off by default: the deep read is what makes this feature different from `git log --grep`, and a
   * user who has never chosen should get the answer that is right rather than the one that is fast.
   */
  const [quick, setQuick] = useState(false)
  /** A saved run the user reopened, shown instead of the live one until they search again. */
  const [viewedRun, setViewedRun] = useState<StoredSearchRun | null>(null)

  // ── The run, on the notch ────────────────────────────────────────────────────────────────────
  // A deep search is one model call per file of every commit it opens, so a sixty-commit run is
  // minutes — and nobody watches a bar for minutes. They switch to their editor, and the run goes
  // invisible. Only while the window is unfocused, though: this panel is a far better place to
  // watch a search you are actually watching, and a card duplicating it would be pure noise.
  const windowFocused = useWindowFocus()
  const repoName = useMemo(() => repoPath.split('/').filter(Boolean).pop() ?? repoPath, [repoPath])
  const notchModel = useMemo(
    () =>
      commitSearchNotchModel({
        repoPath,
        repoName,
        question: search.askedQuestion,
        phase: search.phase,
        progress: search.progress,
        matchCount: search.matches.length,
        t,
      }),
    [
      repoPath,
      repoName,
      search.askedQuestion,
      search.phase,
      search.progress,
      search.matches.length,
      t,
    ]
  )
  useNotchOperation({
    id: commitSearchNotchId(repoPath),
    model: notchModel,
    enabled: !windowFocused,
    actions: { cancel: () => void search.cancel() },
  })

  const openCommit = useCallback((oid: string) => {
    // The graph already knows how to select a commit and open its diff — this only points at one.
    useRepoUIStore.getState().setPendingGraphSelection(oid)
  }, [])

  const runSearch = useCallback(() => {
    setViewedRun(null)
    void search.search(question, { maxCommits, mode: quick ? 'quick' : 'deep' })
  }, [search, question, maxCommits, quick])

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
        oldestRead: formatReadDate(viewedRun.oldestEpoch, i18n.language),
        // A saved run kept the count and the reason, not the commits: which ones failed is only
        // actionable while they are still on screen (see `aiCommitSearch.store`).
        unread: [],
        failed: viewedRun.failed,
        failureReason: viewedRun.failureReason,
        truncated: viewedRun.truncated,
        mode: viewedRun.mode ?? 'deep',
        filesRead: viewedRun.filesRead ?? 0,
      }
    : {
        question: search.askedQuestion,
        answer: search.answer,
        matches: liveMatches,
        // Commits actually read, matching the denominator the answer was given: a commit that went
        // unread said nothing, so counting it here would overstate what "none found" rests on.
        scanned: search.results.length - search.unread.length,
        oldestRead: formatReadDate(search.oldestEpoch, i18n.language),
        unread: search.unread,
        failed: search.unread.length,
        failureReason: dominantFailure(search.unread),
        truncated: search.truncated,
        mode: quick ? ('quick' as const) : ('deep' as const),
        filesRead: search.results.reduce((total, r) => total + (r.filesRead ?? 0), 0),
      }

  const progress = search.progress
  const hasAnswer = shown.answer.trim().length > 0
  /** A live run still reading commits — a saved run is never one, however it is displayed. */
  const isReading = !viewedRun && search.isRunning

  return (
    <div
      data-testid="ai-commit-search-panel"
      className="flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-border bg-card shadow-2xl"
    >
      <div className="flex flex-col gap-2.5 border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Search className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{t('gitTree.commitSearch.panelTitle')}</span>
          </h3>
          <Button
            variant="ghost"
            size="iconSm"
            className="shrink-0"
            onClick={onClose}
            aria-label={t('actions.close')}
            data-testid="commit-search-close-panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <CommitSearchForm
          question={question}
          onQuestionChange={setQuestion}
          maxCommits={maxCommits}
          onMaxCommitsChange={setMaxCommits}
          quick={quick}
          onQuickChange={setQuick}
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
              {/* The commit count is what was asked for; the file count is what the wait is made of,
                  since every file is its own model call. Without it a bar that has barely moved
                  after two minutes looks stuck rather than busy. */}
              {progress.filesRead !== undefined && progress.filesRead > 0 && (
                <span data-testid="commit-search-files-read">
                  {' · '}
                  {t('gitTree.commitSearch.filesRead', { count: progress.filesRead })}
                </span>
              )}
            </p>
            {/* The narrowing is one call per commit, during which both counters above are frozen —
                the same stall the file counter was added to fix, one level up. */}
            {progress.narrowing && (
              <p
                className="text-[10px] text-muted-foreground"
                data-testid="commit-search-narrowing"
              >
                {t('gitTree.commitSearch.narrowing')}
              </p>
            )}
            <Progress
              value={Math.round((progress.completed / Math.max(1, progress.total)) * 100)}
            />
          </div>
        )}
        {/* Its own line rather than the scanning one, which counted "0 of 1" and read as a search
            over a single commit — the triage is one pass over every message, not a commit at all. */}
        {progress?.phase === 'triaging' && (
          <p className="text-[10px] text-muted-foreground" data-testid="commit-search-triaging">
            {t('gitTree.commitSearch.triaging')}
          </p>
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
            <p
              className="text-[11px] text-muted-foreground italic"
              data-testid="commit-search-asked"
            >
              {t('gitTree.commitSearch.asked', { question: shown.question })}
            </p>
          )}

          {search.phase === 'error' && (
            <p
              className="text-xs wrap-break-word text-tone-danger"
              data-testid="commit-search-error"
            >
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
          {shown.unread.length > 0 ? (
            <CommitSearchUnreadList unread={shown.unread} onOpenCommit={openCommit} />
          ) : (
            shown.failed > 0 && (
              // A reopened run: the commits are gone, but the count and the cause survived.
              <p className="text-[10px] text-tone-warning" data-testid="commit-search-failed">
                {t('gitTree.commitSearch.unread.title', { count: shown.failed })}{' '}
                {shown.failureReason && t(`gitTree.commitSearch.unread.${shown.failureReason}`)}
              </p>
            )
          )}
          {/* Only once the reading is over. The flag is known the instant the commit list comes
              back — before a single one has been read — so showing it live announced "these 0
              commits are the most recent ones" for the whole run, which is both alarming and
              false. It qualifies an answer, so it waits for one. */}
          {shown.truncated && !isReading && (
            <p className="text-[10px] text-tone-warning" data-testid="commit-search-truncated">
              {t('gitTree.commitSearch.truncatedNotice', {
                scanned: shown.scanned,
                date: shown.oldestRead,
              })}
            </p>
          )}

          {/* The one thing that changes how much an answer is worth: a "no" from the messages is a
              far weaker claim than a "no" from the diffs, and nothing else on screen distinguishes
              them. Shown for quick runs only — the deep read is what the panel is otherwise about. */}
          {shown.mode === 'quick' && !isReading && hasAnswer && (
            <p className="text-[10px] text-tone-warning" data-testid="commit-search-quick-badge">
              {t('gitTree.commitSearch.quickBadge')}
            </p>
          )}

          {/* Not a warning — nothing went wrong. Every commit is read file by file, one model call
              each, and this is what a run's duration is actually made of: ten commits over twenty
              files each is two hundred calls, not ten. */}
          {shown.filesRead > 0 && !isReading && (
            <p className="text-[10px] text-muted-foreground" data-testid="commit-search-files">
              {t('gitTree.commitSearch.filesReadTotal', {
                count: shown.filesRead,
                commits: shown.scanned,
              })}
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
