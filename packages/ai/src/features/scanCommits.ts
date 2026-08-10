import type { ScanCommit } from '../config'
import { AiCallTimedOut } from './aiCallTimedOut'
import { AiCallTracker, type CancelCall } from './aiCallTracker'
import { CommitVerdictUnreadable } from './commitRelevance'
import type { CommitRelevanceInput, CommitRelevanceResult } from './commitRelevance'
import { isCompletionCancelled } from './completionCancelled'
import { splitDiffByFile, type DiffFileSection } from './diffBudget'
import {
  DEFAULT_AI_CONCURRENCY,
  mapConcurrently,
  type MapConcurrentlyOutcome,
} from './mapConcurrently'
import { SummaryRunCancelled } from './summarizeFiles'

/**
 * Progress of a scan that reads commits one at a time.
 *
 * `total` is the commit count during `scanning`, and 1 during the other two — `triaging` is the
 * quick mode's single pass over every message, and `composing` is the answer, one call however much
 * history was read.
 */
export interface CommitScanProgress {
  phase: 'triaging' | 'scanning' | 'composing'
  completed: number
  total: number
  /** Short oid of the commit being read right now, so the panel can name what it is on. */
  current?: string
  /**
   * Files read so far across every finished commit — the run's real unit of work.
   *
   * The commit count is what the user asked for, but every commit costs one call per file, so "3 of
   * 10" on its own understates a wait by an order of magnitude. This is what makes a bar that has
   * barely moved legible.
   */
  filesRead?: number
  /**
   * True while a commit's files are being narrowed, before any of them is opened.
   *
   * Its own flag because it is the second stall this feature produced: the narrowing is one model
   * call per commit, and during it both the commit count and the file count are frozen — which is
   * indistinguishable from a hung run unless something says what is happening.
   */
  narrowing?: boolean
}

/**
 * Why a commit went unread.
 *
 * Four causes, kept apart because they are four different problems and each has its own fix.
 * `unreadable` means the provider answered but not in a shape that can be read — usually it is
 * ignoring the requested output format, it will do it for every commit, and switching model fixes
 * it. `timeout` means the model needed longer than the configured budget, which on a per-commit
 * scan is the most likely failure of all: one call per commit, each reading a whole diff, against a
 * timeout chosen for a single quick generation. `diff` is local and per-commit. `call` is anything
 * else the transport reported.
 *
 * Collapsing them was the whole reason the panel could only say "N commits could not be read" — and
 * the first real run showed why that mattered: six of ten commits went unread, all of them at
 * exactly the 30-second mark, and nothing on screen pointed at the timeout setting.
 */
export type ScanFailure = 'diff' | 'unreadable' | 'timeout' | 'call'

/** One commit's outcome: what it was, and what it answered. */
export interface ScannedCommit {
  commit: ScanCommit
  relevant: boolean
  /** What it did about the question; empty when not relevant or unread. */
  finding: string
  /** Paths carrying it, already intersected with the commit's real file list. */
  files: string[]
  /**
   * True when this commit could not be read (its diff or its model call failed).
   *
   * Reported rather than swallowed: a commit that failed is not a commit that said "no", and an
   * answer built as if it were would be a confident negative resting on a gap.
   */
  failed: boolean
  /** Which of the three failures happened. Unset when the commit was read. */
  failure?: ScanFailure
  /**
   * How many files this commit was read in — i.e. how many model calls it cost.
   *
   * Surfaced because it is what the run's duration is actually made of: the commit count is the
   * number on screen, but a search over ten commits touching twenty files each is two hundred calls.
   * Zero for a commit that could not be read.
   */
  filesRead: number
}

export interface ScanCommitsOptions {
  onProgress?(progress: CommitScanProgress): void
  /**
   * Called as each commit is decided, so the panel can fill in as the scan runs rather than showing
   * a bar for two minutes and everything at once at the end. A search over a month is long enough
   * that the first match arriving early is what tells the user it is working.
   *
   * `index` is the commit's position in `commits`, and it is not the order these arrive in once
   * `concurrency` is above 1 — the caller needs it to keep its live list in history order.
   */
  onResult?(result: ScannedCommit, index: number): void
  /**
   * Polled before each commit is dispatched, and on a timer while calls are in flight.
   *
   * Cancellation used to be **between** commits and nothing else, because the completion transport
   * took no request id — a call already sent ran to completion and had its result discarded. On this
   * feature that was the difference between a stop and a stop: a search is one call per *file* of
   * every commit, each reading a whole diff, so "stop dispatching" left the model working for the
   * length of whatever it had already started. Paired with {@link cancelCall}, the in-flight call is
   * now aborted too.
   */
  shouldCancel?(): boolean
  /**
   * Stops one in-flight call, named by the id it was dispatched under.
   *
   * Covers both calls this function makes — the per-file verdict and the quick mode's narrowing —
   * since both go through the same tracker. Anything the *caller* dispatches outside this function
   * (the quick mode's triage pass over every message) is the caller's own to stop.
   */
  cancelCall?: CancelCall
  /**
   * How many commits may be read at once. Defaults to {@link DEFAULT_AI_CONCURRENCY} (one).
   *
   * Worth raising only against a provider that batches; see {@link mapConcurrently} for the measured
   * shape of the trade and why the default cannot be anything but 1.
   */
  concurrency?: number
  /**
   * Narrows which of a commit's files are opened. **Absent means all of them**, which is the deep
   * search: it reads everything and takes as long as that takes.
   *
   * Supplied by the quick search, where it is the narrowing that actually decides the wait. Reading
   * every file of every shortlisted commit was still ninety-four calls on a measured run — one
   * commit cost thirty-four by itself — because shortlisting *commits* does nothing about a commit
   * that touches thirty files.
   *
   * A path it returns that the diff has no section for is ignored, and returning nothing means the
   * commit is read as touching nothing relevant. Throwing is *not* fatal: the caller falls back to
   * opening every file, because a failed narrowing must degrade into the slow, complete behaviour
   * rather than into a commit silently skipped. The one rejection that *is* fatal is a cancellation —
   * degrading a stop into "read everything" would be the opposite of what was asked.
   *
   * `requestId` is the id this narrowing call must be dispatched under, so a stop can reach it.
   */
  selectFiles?(commit: ScanCommit, paths: string[], requestId: string): Promise<string[]>
}

/** How many of a commit's file-level findings are carried into its single `finding` line. */
const MAX_MERGED_FINDINGS = 3

/** Ends a finding with a full stop so several of them read as sentences rather than as one run-on. */
function asSentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`
}

/** Longest commit body carried into a per-file prompt. */
const BODY_CHARS_PER_FILE = 400

/**
 * The commit's intent, short enough to be worth repeating once per file.
 *
 * The whole body used to travel with every call, on the reasoning that the model should know what
 * the change was *for* while looking at one file of it. That reasoning holds; the size did not. A
 * measured run on this repository sent a 2 300-character body **22 times** for one commit — fifty
 * thousand characters of identical text, two thirds of every prompt before the diff was even added.
 *
 * The first paragraph is the part that carries the intent; what follows it is per-file detail, which
 * is precisely what the file's own diff is there to supply. So the header keeps the first paragraph
 * and drops the essay.
 */
function commitIntent(body: string): string {
  const firstParagraph = body.trim().split(/\n\s*\n/, 1)[0] ?? ''
  return firstParagraph.length > BODY_CHARS_PER_FILE
    ? `${firstParagraph.slice(0, BODY_CHARS_PER_FILE).trimEnd()}…`
    : firstParagraph
}

/**
 * The units one commit is read in: its files, or the whole patch when it has no file structure.
 *
 * A diff with no recognizable `diff --git` header — which a provider or a synthetic patch can
 * produce — yields no sections. That is the degenerate case of the same loop, not a second way of
 * reading: one section covering everything, judged by the same call as any other section.
 */
function readingUnits(diff: string): DiffFileSection[] {
  const sections = splitDiffByFile(diff)
  if (sections.length > 0) return sections
  return diff.trim().length > 0 ? [{ path: '', tier: 'source', text: diff }] : []
}

/**
 * Applies {@link ScanCommitsOptions.selectFiles}, when there is one, to the units about to be read.
 *
 * Three things are deliberate here, and each is the safe direction of a choice that could go either
 * way:
 *
 *  - **No narrowing means no change.** The deep search does not pass one, so it keeps opening
 *    everything without this function having an opinion about it.
 *  - **A failure opens everything.** If the narrowing call throws, the commit is read whole rather
 *    than skipped: degrading into the slow behaviour is recoverable, degrading into a commit nobody
 *    looked at is the exact silence the feature exists to prevent. A *cancelled* call is the one
 *    exception and is rethrown — falling back to reading every file because the user pressed stop
 *    would turn the stop into the longest possible run.
 *  - **An unnamed section is always kept.** A diff with no file structure has no path to judge it
 *    by, so it is not the narrowing's to reject.
 */
async function narrowSections(
  sections: DiffFileSection[],
  commit: ScanCommit,
  selectFiles: ScanCommitsOptions['selectFiles'],
  calls: AiCallTracker,
  onNarrowing: () => void
): Promise<DiffFileSection[]> {
  if (!selectFiles || sections.length === 0) return sections

  const paths = sections.map((s) => s.path).filter((p) => p.length > 0)
  if (paths.length === 0) return sections

  onNarrowing()
  let kept: string[]
  try {
    kept = await calls.track((requestId) => selectFiles(commit, paths, requestId))
  } catch (error) {
    if (isCompletionCancelled(error)) throw error
    return sections
  }

  const wanted = new Set(kept)
  return sections.filter((section) => section.path.length === 0 || wanted.has(section.path))
}

/**
 * Reads one commit **file by file** and merges the verdicts into the commit's own.
 *
 * The map phase one level below `scanCommits`, and the same move `summarizeFiles` makes for a
 * changeset: a prompt has to fit what it carries, so the unit that has to fit is the file — never the
 * commit, whose size nobody controls. On this repository a feature commit runs to 130 000 characters
 * across 25 files; against the 4096-token window most machines get from Ollama, the diff's allowance
 * comes to about 10 000 characters. **Eight per cent of the commit** — and a verdict given on that is
 * not a weaker answer about the commit, it is a confident answer about a different one.
 *
 * It runs **whatever the commit's size**, exactly as `summarizeFiles` does and for the same reason: a
 * threshold would make one button mean two behaviours depending on a number nobody can see, so a bad
 * verdict could not be reasoned about without first working out which path produced it. One way,
 * always. The cost is calls on small commits, and it is paid deliberately.
 *
 * Each file is judged by the same `commitRelevanceFeature` — same instruction, same schema, same
 * acceptance gates — so a file-level verdict cannot get in on easier terms. The commit's own message
 * travels with every call, so the model still knows what the change was *for* while looking at one
 * file of it.
 *
 * The merge needs no model call: a commit is relevant when any of its files is, the paths are the
 * ones those files named, and the finding is their findings. Composing them with a further call would
 * spend a request per commit to rewrite text that is already specific and already grounded in a diff.
 *
 * **Any file failing fails the commit.** A partial read would let "not found in this commit" mean
 * "not found in the eleven files that happened to answer", which is exactly the silent gap this whole
 * design exists to prevent — so the caller records it as unread instead.
 *
 * Sequential on purpose: the commit-level pool already holds `concurrency` calls in flight, and
 * nesting a second pool inside it would multiply that by the number of files.
 */
async function judgeFileByFile(
  input: CommitRelevanceInput,
  sections: DiffFileSection[],
  judge: (input: CommitRelevanceInput, requestId: string) => Promise<CommitRelevanceResult>,
  calls: AiCallTracker,
  onFileRead: () => void
): Promise<CommitRelevanceResult> {
  const statuses = new Map(input.files.map((f) => [f.path, f.status]))
  const findings: string[] = []
  const files: string[] = []
  let relevant = false

  const shared = { ...input, commit: { ...input.commit, body: commitIntent(input.commit.body) } }

  for (const section of sections) {
    const verdict = await calls.track((requestId) =>
      judge(
        {
          ...shared,
          // An unnamed section is the whole patch: the model gets the commit's real file list, since
          // there is no single path to attribute it to.
          files: section.path
            ? [{ path: section.path, status: statuses.get(section.path) ?? 'modified' }]
            : input.files,
          diff: section.text,
        },
        requestId
      )
    )
    // Reported per file, not per commit. A commit of twenty-five files is twenty-five calls, so a
    // counter that only moves when the commit finishes sits at zero for minutes — which is exactly
    // what "0 of 15" looked like on the first real run of this.
    onFileRead()
    if (!verdict.relevant) continue
    relevant = true
    if (verdict.finding) findings.push(asSentence(verdict.finding))
    files.push(...verdict.files)
  }

  return {
    relevant,
    finding: relevant ? findings.slice(0, MAX_MERGED_FINDINGS).join(' ') : '',
    files: relevant ? [...new Set(files)] : [],
  }
}

/** What every commit's prompt shares — the question being asked, and how to write the answer. */
export interface ScanCommitsParams {
  question: string
  language?: string
  contextTokens?: number
}

/**
 * Reads each commit against the question, one model call each, newest first.
 *
 * The **map** half of the AI commit search. It is a sibling of `summarizeFiles` and exists for the
 * same reason at a different granularity: there, one prompt could not hold every *file* of a
 * changeset; here, one prompt cannot hold every *commit* of a month. The consequence is worse in this
 * direction, though — an unread file makes an explanation incomplete, while an unread commit makes
 * the answer "no, that never changed" flatly wrong.
 *
 * **Sequential by default**, like its sibling, and widened only by an explicit `concurrency`: whether
 * several calls at once are faster is a property of the provider, not of this code — see
 * {@link mapConcurrently}. Either way `onProgress` stays honest, because `completed` counts commits
 * actually decided rather than requests dispatched.
 *
 * A commit whose diff or model call fails is kept with `failed: true` rather than dropped: the caller
 * reports it, and the answer's denominator excludes it, so a provider hiccup shows up as "read 57 of
 * 60" instead of quietly becoming part of a negative answer.
 *
 * Paths the model names are intersected with the commit's own file list before being returned. The
 * model is asked to copy them verbatim and mostly does; the intersection is what guarantees the panel
 * never offers a link to a file that commit never touched.
 */
export async function scanCommits(
  commits: ScanCommit[],
  loadDiff: (commit: ScanCommit) => Promise<string>,
  judge: (input: CommitRelevanceInput, requestId: string) => Promise<CommitRelevanceResult>,
  params: ScanCommitsParams,
  options: ScanCommitsOptions = {}
): Promise<ScannedCommit[]> {
  const { onProgress, onResult, shouldCancel } = options
  const concurrency = options.concurrency ?? DEFAULT_AI_CONCURRENCY
  const calls = new AiCallTracker(options.cancelCall)

  let completed = 0
  let filesRead = 0
  onProgress?.({ phase: 'scanning', completed: 0, total: commits.length, filesRead: 0 })

  const readOne = async (commit: ScanCommit): Promise<ScannedCommit> => {
    // Naming the commit being read only makes sense while there is one. Above concurrency 1 several
    // are in flight and any single name would be arbitrary, so the panel is told the count alone
    // rather than a plausible-looking half-truth.
    if (concurrency <= 1) {
      onProgress?.({
        phase: 'scanning',
        completed,
        total: commits.length,
        current: commit.shortOid,
        filesRead,
      })
    }

    // Which half of the work is running, so a rejection can be attributed without inspecting the
    // error's text: a git failure and a provider failure look identical once they are strings.
    let failure: ScanFailure = 'diff'
    try {
      const diff = await loadDiff(commit)
      failure = 'call'
      const input: CommitRelevanceInput = {
        question: params.question,
        commit: {
          shortOid: commit.shortOid,
          subject: commit.subject,
          body: commit.body,
          author: commit.author,
          timestamp: commit.timestamp,
        },
        files: commit.files,
        diff,
        language: params.language,
        contextTokens: params.contextTokens,
      }

      const sections = await narrowSections(
        readingUnits(diff),
        commit,
        options.selectFiles,
        calls,
        () =>
          onProgress?.({
            phase: 'scanning',
            completed,
            total: commits.length,
            filesRead,
            narrowing: true,
            ...(concurrency <= 1 ? { current: commit.shortOid } : {}),
          })
      )
      const verdict = await judgeFileByFile(input, sections, judge, calls, () => {
        filesRead++
        onProgress?.({
          phase: 'scanning',
          completed,
          total: commits.length,
          filesRead,
          ...(concurrency <= 1 ? { current: commit.shortOid } : {}),
        })
      })

      const known = new Set(commit.files.map((f) => f.path))
      return {
        commit,
        relevant: verdict.relevant,
        finding: verdict.finding,
        files: verdict.files.filter((p) => known.has(p)),
        failed: false,
        filesRead: sections.length,
      }
    } catch (error) {
      // A stop is not a failure, and this is the catch that would turn it into one: every unread
      // commit here is reported to the user as a commit that could not be read, with a cause and a
      // suggested fix. Rethrown so a cancelled run records nothing at all.
      if (isCompletionCancelled(error)) throw new SummaryRunCancelled()
      // The parse throws its own type, so "the provider answered nonsense" is distinguishable from
      // "the provider never answered" — the difference between a model to change and a server to
      // start.
      if (error instanceof CommitVerdictUnreadable) failure = 'unreadable'
      else if (error instanceof AiCallTimedOut) failure = 'timeout'
      return {
        commit,
        relevant: false,
        finding: '',
        files: [],
        failed: true,
        failure,
        filesRead: 0,
      }
    }
  }

  let outcome: MapConcurrentlyOutcome<ScannedCommit>
  try {
    outcome = await mapConcurrently(commits, concurrency, readOne, {
      onSettled: (result, index) => {
        completed++
        onResult?.(result, index)
        onProgress?.({ phase: 'scanning', completed, total: commits.length, filesRead })
      },
      shouldStop: () => shouldCancel?.() ?? false,
      onStop: () => calls.cancelAll(),
    })
  } catch (error) {
    // The aborted calls surface here as the pool's rethrown rejection — every commit they belonged
    // to has already declined to record itself. They mean what `stopped` means below.
    if (error instanceof SummaryRunCancelled || isCompletionCancelled(error)) {
      throw new SummaryRunCancelled()
    }
    throw error
  }

  const { results, stopped } = outcome
  if (stopped || shouldCancel?.()) throw new SummaryRunCancelled()
  return results
}
