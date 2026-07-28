import type { ScanFailure } from '@git-manager/ai'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * One commit an AI search found, flattened for storage.
 *
 * A flattened copy of the interesting half of `ScannedCommit` rather than the thing itself: what is
 * kept has to survive in `localStorage` for months and be readable when the commit's diff, the
 * model, and the settings have all moved on. The full `ScanCommit` carries the whole file list and
 * the line counts, which are re-derivable from the oid and would multiply the stored size of every
 * run for a column nobody reads back.
 */
export interface StoredSearchMatch {
  oid: string
  shortOid: string
  subject: string
  author: string
  /** Author timestamp, seconds since the epoch. */
  timestamp: number
  /** What the model said this commit did about the question. */
  finding: string
  /** The paths carrying it — already checked against the commit's real files when it was found. */
  files: string[]
}

/** One saved question and everything the run behind it produced. */
export interface StoredSearchRun {
  /** Stable id, minted when the run starts — also the React key and what deletion targets. */
  id: string
  /** The question, verbatim. */
  question: string
  /** The model's answer, as markdown. Empty when the run was cancelled or failed mid-way. */
  answer: string
  /** Commits judged relevant, newest first. */
  matches: StoredSearchMatch[]
  /** How many commits were read, i.e. the denominator of the answer's claims. */
  scanned: number
  /** How many could not be read (diff or model call failed) — kept, because it qualifies a "no". */
  failed: number
  /**
   * Why most of them went unread, when any did.
   *
   * The reason is kept and the per-commit list is not: which commits failed is only actionable while
   * the run is on screen, but *why* is what makes a remembered run readable months later — "the
   * model was answering in the wrong shape" and "the provider was down" leave the same count behind
   * and mean entirely different things about the answer above them.
   */
  failureReason?: ScanFailure
  /** True when history holds commits older than the ones read. */
  truncated: boolean
  /**
   * Which kind of search produced this answer.
   *
   * The single most important thing to know about an old run, because the two modes answer different
   * questions: `deep` read what the commits *did*, `quick` read what their authors *said* they did. A
   * "no" from a quick search is a much weaker claim than a "no" from a deep one, and months later
   * nothing else on the entry would tell them apart. Optional: runs saved before the quick mode
   * existed were all deep.
   */
  mode?: 'deep' | 'quick'
  /**
   * How many files were read across the run — its real cost, and usually its duration.
   *
   * Kept because the commit count alone is misleading months later: every commit is read one call
   * per file, so ten commits can mean two hundred requests. Optional: runs saved before commits were
   * read file by file have none.
   */
  filesRead?: number
  /**
   * The span actually covered, in epoch seconds. Optional: runs saved before the search dropped its
   * time window carry a length-of-window instead, and an old entry must not break the history list.
   */
  oldestEpoch?: number
  newestEpoch?: number
  /** Epoch milliseconds when the run finished. */
  ranAt: number
  /** The model that answered. A run reads very differently once you know which model produced it. */
  model: string
}

/**
 * How many runs one repository keeps.
 *
 * These entries are large (an answer plus every match's sentence), they live in `localStorage`
 * alongside every other persisted store, and their value decays fast — the tenth-oldest question
 * about a repo is not one anybody reopens. Oldest are dropped first.
 */
export const MAX_RUNS_PER_REPO = 20

interface AiCommitSearchState {
  /** Keyed by repository path, newest run first. */
  runs: Record<string, StoredSearchRun[]>
  /** Adds a finished run to a repo's history, evicting the oldest past {@link MAX_RUNS_PER_REPO}. */
  addRun: (repoPath: string, run: StoredSearchRun) => void
  /** Drops one run by id. */
  removeRun: (repoPath: string, id: string) => void
  /** Drops a repository's whole history. */
  clearRepo: (repoPath: string) => void
}

/**
 * Remembers the AI commit searches run against each repository.
 *
 * Persisted for the reason the explanations are: a search costs one model call *per commit* over a
 * month of history, so re-asking a question you already asked is minutes of local model time to
 * reproduce an answer you have already read. Keeping the matches alongside the answer is what makes
 * an old run still useful — the panel can list the commits it found and open any of them, which is
 * the follow-up question the answer always provokes.
 *
 * Holds only finished runs. Everything transient (scanning, streaming, progress, error) lives in
 * `useAiCommitSearch`.
 */
export const useAiCommitSearchStore = create<AiCommitSearchState>()(
  persist(
    (set) => ({
      runs: {},

      addRun: (repoPath, run) =>
        set((state) => ({
          runs: {
            ...state.runs,
            [repoPath]: [run, ...(state.runs[repoPath] ?? [])].slice(0, MAX_RUNS_PER_REPO),
          },
        })),

      removeRun: (repoPath, id) =>
        set((state) => {
          const existing = state.runs[repoPath]
          if (!existing) return state
          const next = existing.filter((r) => r.id !== id)
          return { runs: { ...state.runs, [repoPath]: next } }
        }),

      clearRepo: (repoPath) =>
        set((state) => {
          if (!state.runs[repoPath]) return state
          const next = { ...state.runs }
          delete next[repoPath]
          return { runs: next }
        }),
    }),
    { name: 'git-manager-ai-commit-searches' }
  )
)
