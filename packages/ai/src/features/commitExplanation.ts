import type { StreamingFeature } from '../runtime'
import { budgetDiff } from './diffBudget'
import {
  assessDiffCoverage,
  diffCharBudget,
  notIncludedSection,
  OMITTED_RESERVE_TOKENS,
  type DiffCoverage,
} from './diffCoverage'
import { languageName } from './language'
import { estimateTokens } from '../promptSize'

/** The instruction (system prompt) for explaining a single commit.
 *
 * The distinguishing constraint: a commit already carries a message, so paraphrasing it back adds
 * nothing. This feature earns its keep when the message is terse, stale or optimistic — so the model
 * is told to describe what the diff *actually does*, and to say plainly when that doesn't match what
 * the subject claims. That is the question a reader of someone else's commit is really asking.
 *
 * Two rules exist because of what a *budgeted* diff does to an answer, and both were written against
 * the same run: a 21-file commit of which 6 were read came back as three file-by-file bullets and a
 * closing paragraph enumerating the fifteen files it had not opened.
 *
 * - **The coverage line is banned outright**, where the code review is merely asked to keep it short.
 *   The review has to hedge — it is claiming defects, and one it could not see matters. An
 *   explanation claims nothing, the panel already reports coverage exactly, and the model asked for
 *   "one short line" produces a list as long as the answer. Two lines of prose spent saying what is
 *   already on screen, in a 250-word budget.
 * - **File-by-file is banned**, for the reason it happens: shown a fraction of the files, a model
 *   with nothing else to structure an answer around describes the fraction, one bullet each. The fix
 *   is not to forbid the symptom alone but to give it the missing structure — the *complete* file
 *   list, stats included, whose entries say which diffs were not shown. That list is to a commit what
 *   the commit list is to a pull-request description: the shape of the change, cheap, and whole even
 *   when the diff is not.
 *
 * Fixing those two exposed a third, which they had been hiding. Once the answer was well-structured
 * it became clear it was structured *around the commit message*: on a commit whose message runs to
 * three paragraphs, all four bullets tracked those paragraphs, and the 45 lines deleted from
 * `runtime.ts` — which the message never mentions, and which is exactly what this feature exists to
 * surface — appeared nowhere. The cause is the same partial view: starved of diff, the richest text
 * in the prompt *is* the message, so the model summarizes that instead.
 *
 * "Do not paraphrase" was already there and was not enough, because it is a prohibition with no
 * test attached. It is now stated as a gradient (the more detailed the message, the less of it you
 * may follow) and backed by one checkable obligation: at least one bullet must carry something the
 * message never mentions. The file list is what makes that checkable — a path the message is silent
 * about is a candidate the model can actually find. */
export const COMMIT_EXPLANATION_INSTRUCTION = `You are an expert software engineer explaining ONE commit to a developer reading it in a history browser.

The reader can already see the commit's message. Do NOT paraphrase it back. Your value is exactly what it leaves out, so the MORE detailed the message, the LESS of it you may follow — a terse or misleading message is where you say the most.

CHANGED FILES is the COMPLETE list of every file the commit touches, grouped by directory, with line counts; entries marked "diff not shown" or "shortened" are still part of the commit, and a directory given as a count ("6 files") holds that many more. DIFF holds the content of as many as fitted. Scope your answer with the list; take substance from the diff.

Output rules (STRICT):
- Return ONLY the explanation as GitHub-flavored Markdown — no preamble, no title, no code fences.
- Start with a single bold sentence saying what the commit does, in your own words, scoped by the WHOLE file list. It is about THE CHANGE — never about the diff being incomplete or hard to read.
- Then 2 to 5 bullets: what behavior changes, how the pieces relate, what each area is for. Backtick files and identifiers.
- Bullets are about CHANGES, never about files one by one. Files serving one change are ONE bullet naming that change; trivial churn (formatting, imports, generated files, tests that merely follow) is one bullet for all of it. One bullet per file means you are listing the diff, not explaining it.
- At least ONE bullet must carry something the message never mentions — a file it does not name, an area it does not claim to touch, a consequence it does not state. A path the message is silent about is the likeliest place to look. If every bullet maps to a sentence of the message, you have added nothing: start again from the list and the diff.
- Account for a file you could not read from its path and line counts ("the same rename across 9 call sites", "4 documentation pages"). Say what it evidently is, never what it evidently does.
- NEVER mention truncation, budgets, or what you could not read — no note, no caveat, not one word. The interface already tells the reader how much was read.
- Add a final "⚠️" line ONLY when the diff shows something the reader should know and the message does not mention — an unadvertised behavior change, a removed guard or test, a hardcoded secret, a migration or breaking change. Omit it otherwise; never invent one.
- If the diff plainly does something other than what the message claims, say so in one short sentence. Do not speculate about intent beyond what the code shows.
- Base every statement ONLY on the message, the file list and the diff.
- A diff shows only a few lines around each change. NEVER state that something is missing merely because you cannot see it — a guard, a call site or a cleanup may sit just outside what you were shown. Absence of evidence is not evidence of absence.
- Describe, do not review: no praise, no suggested rewrites.
- Under 250 words, in the language requested by the user prompt.`

/** The commit being explained, as a self-describing unit. Deliberately not the app's `GitCommit`
 * DTO — this package stays free of `@git-manager/git-types`. */
export interface CommitExplanationCommit {
  shortOid: string
  /** First line of the commit message. */
  subject: string
  /** The rest of the message, trimmed; empty when subject-only. */
  body: string
  author: string
  filesChanged: number
  insertions: number
  deletions: number
  /** True for a merge commit — the patch is then against its FIRST parent only. */
  isMerge: boolean
}

/**
 * One file the commit touches, whether or not its diff fitted in the budget.
 *
 * The cheap half of the prompt, and the half that stays complete: 21 of these cost ~90 tokens, where
 * their diffs cost tens of thousands. Sending them is what lets an explanation be *about the commit*
 * rather than about the files that happened to fit.
 */
export interface CommitExplanationFile {
  /**
   * The file's path, as it appears in the diff's own `diff --git a/… b/…` header — the new path,
   * falling back to the old one for a deletion. It has to match, or a file whose diff was left out
   * cannot be marked as such in the list.
   */
  path: string
  /** `modified`, `added`, `deleted`, `renamed`… — passed through from the diff. */
  status: string
  insertions: number
  deletions: number
}

export interface CommitExplanationInput {
  repoName: string
  commit: CommitExplanationCommit
  /** Unified-diff text for the whole commit (its files concatenated). */
  patch: string
  /**
   * Every file the commit touches, in the diff's own order. Optional so a caller with only a patch
   * still works — the prompt then simply omits the list, as it did before there was one.
   */
  files?: CommitExplanationFile[]
  /** BCP-47-ish language tag (`'fr'` / `'en'`) the explanation should be written in. */
  language?: string
  /**
   * The model's context window, from the connection settings. Sizes how much of the patch is sent.
   *
   * Replaces a flat 8000-character cut. That constant was wrong in both directions at once: on a
   * stock Ollama window it built a prompt that overflowed — which drops tokens from the *start*,
   * where the instruction lives, so the feature quietly stopped obeying its own output rules — and
   * on a configured 32k window it threw away room the user had already paid for. Absent falls back
   * to the pessimistic default.
   */
  contextTokens?: number
}

/**
 * How many files are named individually. Beyond this the list keeps going, one line per *directory*
 * with a count — see {@link buildFileList}.
 */
const MAX_NAMED_FILES = 30

/**
 * How many directories the collapsed tail may name. Only a pathological tree reaches this; past it
 * the list finally admits to a remainder, which is the one case where it has to.
 */
const MAX_COLLAPSED_DIRS = 15

/**
 * Renders the changed-file list, grouped by directory and marking the files whose diff did not
 * make it in.
 *
 * The marks are the first point. An unmarked list would leave the model to infer coverage by
 * checking every path against the diff below — which it does badly, and which is how "files it
 * could not see" turns into "files that are not there". Marked, a file it cannot read is still a
 * file it can place.
 *
 * The grouping is the second, and it buys two things at once. It is *cheaper*: this repo's paths run
 * to 60 characters and 21 of them flat cost ~490 tokens — 12 % of a stock 4096-token window, taken
 * straight out of the diff. And it is *the right shape*: the answer is supposed to be about areas of
 * the change rather than about files, so the list it reasons from should be too. `modified` is left
 * implicit, being the overwhelming default; anything else is worth its four words.
 *
 * The tail is collapsed rather than dropped, and that is the third point — a correction, paid for by
 * a wrong answer. A plain cap ending in `…and 18 more files` looks harmless and is not: the model is
 * told to account for every file, so a remainder with no paths is a question it cannot answer and
 * will not leave alone. On a 48-file commit it duly described "the 18 other files" as documentation,
 * tests and stores — all of which were among the 30 it *could* see. Nothing was invented, yet the
 * sentence was false, which is the worst shape an error can take here.
 *
 * So past {@link MAX_NAMED_FILES} the list stops naming files and keeps listing *directories*, with
 * a count and their line totals. Every file stays accounted for at some granularity, the cost stays
 * bounded, and "4 documentation pages" becomes a statement the model can make truthfully.
 */
function buildFileList(
  files: CommitExplanationFile[],
  omitted: Set<string>,
  truncated: Set<string>
): string {
  const byDir = new Map<string, CommitExplanationFile[]>()
  for (const f of files) {
    const slash = f.path.lastIndexOf('/')
    const dir = slash === -1 ? '.' : f.path.slice(0, slash)
    byDir.set(dir, [...(byDir.get(dir) ?? []), f])
  }

  const named = (f: CommitExplanationFile) => {
    const notes = [f.status === 'modified' ? '' : f.status, `+${f.insertions}/-${f.deletions}`]
    if (omitted.has(f.path)) notes.push('diff not shown')
    else if (truncated.has(f.path)) notes.push('shortened')
    return `${f.path.slice(f.path.lastIndexOf('/') + 1)} (${notes.filter(Boolean).join(', ')})`
  }

  // Directories are expanded in the diff's own order while the naming budget lasts, then every
  // remaining one is collapsed. Whole directories either way: a half-listed directory reads as a
  // complete one, which is the same lie as dropping it.
  let budget = MAX_NAMED_FILES
  const lines: string[] = []
  const collapsed: [string, CommitExplanationFile[]][] = []

  for (const [dir, group] of byDir) {
    if (group.length <= budget) {
      lines.push(`${dir}/ — ${group.map(named).join(', ')}`)
      budget -= group.length
    } else {
      collapsed.push([dir, group])
    }
  }

  for (const [dir, group] of collapsed.slice(0, MAX_COLLAPSED_DIRS)) {
    const adds = group.reduce((n, f) => n + f.insertions, 0)
    const dels = group.reduce((n, f) => n + f.deletions, 0)
    lines.push(`${dir}/ — ${group.length} files (+${adds}/-${dels})`)
  }

  const overflow = collapsed.slice(MAX_COLLAPSED_DIRS).reduce((n, [, group]) => n + group.length, 0)
  const rest = overflow > 0 ? `\n…and ${overflow} more files, elsewhere in the tree` : ''

  return `\n--- CHANGED FILES (${files.length}, complete) ---\n${lines.join('\n')}${rest}\n--- END CHANGED FILES ---\n`
}

/**
 * How much of the commit's message body the prompt carries.
 *
 * The body is envelope: it displaces diff one-for-one. A well-written one is not small — the commit
 * that introduced the code review has a 3106-character body, **888 tokens, a fifth of a stock
 * 4096-token window** — and the prompt was sending all of it, then instructing the model not to
 * follow it. Spending a fifth of the window on text whose stated purpose is to be *skipped* is the
 * clearest waste in this prompt.
 *
 * The subject is never cut, and the opening paragraphs carry the claims a mismatch would contradict,
 * which is what the body is genuinely needed for. What is lost is the tail of a long rationale — and
 * ~1900 characters of diff bought back with it, which on a small window is another file or two
 * actually read.
 *
 * The cut is **silent, and on a paragraph boundary**, which is deliberate on both counts. A visible
 * `[…truncated]` marker would re-arm the exact failure two rounds of instruction work went into
 * killing: the model is forbidden from remarking on what it could not read, and a marker is an
 * invitation to remark. A message that simply ends is one it has no reason to discuss.
 */
const MAX_MESSAGE_BODY_CHARS = 1200

/** Cuts a long body back to the last paragraph break before the limit, so what remains reads as a
 * message rather than as a sentence stopping mid-word. Falls back to a hard cut when the body has no
 * break to fall back to. */
function trimMessageBody(body: string): string {
  if (body.length <= MAX_MESSAGE_BODY_CHARS) return body
  const head = body.slice(0, MAX_MESSAGE_BODY_CHARS)
  const lastBreak = head.lastIndexOf('\n\n')
  // Only honour a break that leaves most of the allowance used — otherwise a body whose first
  // paragraph is one line would be cut down to that line.
  return lastBreak > MAX_MESSAGE_BODY_CHARS / 2
    ? head.slice(0, lastBreak).trimEnd()
    : head.trimEnd()
}

/** Everything the prompt carries before the file list and the patch — the part whose size is known
 * before any budgeting happens. Shared so {@link buildCommitExplanationPrompt} and
 * {@link assessCommitExplanationCoverage} can never disagree about what the envelope costs. */
function buildPromptHeader(input: CommitExplanationInput): string {
  const { repoName, commit, language } = input

  let header = `Repository: ${repoName}
Commit: ${commit.shortOid} by ${commit.author} (${commit.filesChanged} files, +${commit.insertions}/-${commit.deletions})
Write the entire explanation in ${languageName(language)}.

--- COMMIT MESSAGE ---
${commit.subject}`

  const body = commit.body.trim()
  if (body) header += `\n\n${trimMessageBody(body)}`
  header += `\n--- END COMMIT MESSAGE ---\n`

  if (commit.isMerge) {
    // Without this the model reads a merge's first-parent diff as if the commit authored all of it.
    header += `\nThis is a MERGE commit. The diff below is against its first parent only — it shows what the merge brought in, not changes its author wrote by hand.\n`
  }

  return header
}

/**
 * Everything the prompt costs before the diff: the header, and the file list rendered *unannotated*.
 *
 * The marks a budgeted run adds ("— diff not shown") are not measured here, and do not need to be:
 * they are bounded by {@link MAX_LISTED_FILES} at ~20 characters each, well inside the reserve that
 * used to cover the separate omitted list. Measuring them would need the budget, which needs this.
 */
function envelopeTokensFor(input: CommitExplanationInput): number {
  const files = input.files ?? []
  const list = files.length > 0 ? buildFileList(files, new Set(), new Set()) : ''
  return estimateTokens(buildPromptHeader(input) + list) + OMITTED_RESERVE_TOKENS
}

/** Builds the user-turn prompt: the commit's identity and message, the complete list of files it
 * touches (marking those whose diff did not fit), then the budgeted patch. */
export function buildCommitExplanationPrompt(input: CommitExplanationInput): string {
  let prompt = buildPromptHeader(input)

  // The patch gets what is left of the window once the instruction, this header and the file list
  // are paid for. Measured rather than assumed: a long commit message is part of the envelope, and
  // a squashed merge's body can run to hundreds of tokens on its own.
  const budgeted = budgetDiff(
    input.patch,
    diffCharBudget({
      instruction: COMMIT_EXPLANATION_INSTRUCTION,
      envelopeTokens: envelopeTokensFor(input),
      contextTokens: input.contextTokens,
    })
  )

  const files = input.files ?? []
  if (files.length > 0) {
    // One list, not two. The alternative — a complete list plus a separate "NOT INCLUDED" block —
    // says the same paths twice and invites the model to treat the second one as a topic. Marking
    // the entries in place keeps coverage an attribute of a file rather than a subject of its own.
    prompt += buildFileList(files, new Set(budgeted.omitted), new Set(budgeted.truncated))
  } else {
    // No list supplied: fall back to naming what was dropped, which still beats silence.
    prompt += notIncludedSection(budgeted.omitted, 'describe')
  }

  prompt += `\n--- DIFF ---\n${budgeted.text}\n--- END DIFF ---

Explain what this commit does.`

  return prompt
}

/**
 * What this explanation will and will not have read, computed without sending anything.
 *
 * Worth showing for the same reason as on a review, and arguably more: an explanation reads as
 * confident whatever it saw. "Read 6 of 40 files" is what tells someone their summary of a big
 * squashed merge is a summary of a fraction of it.
 */
export function assessCommitExplanationCoverage(input: CommitExplanationInput): DiffCoverage {
  const coverage = assessDiffCoverage(input.patch, {
    instruction: COMMIT_EXPLANATION_INSTRUCTION,
    envelopeTokens: envelopeTokensFor(input),
    contextTokens: input.contextTokens,
  })

  const files = input.files ?? []
  if (files.length === 0) return coverage

  // The inventory is the authority on how many files the commit has; {@link assessDiffCoverage}
  // counts `diff --git` headers in the patch text, which is a *re-parse* and can disagree — it did,
  // reporting "6 of 21" on a commit git counts 26 files for. Three numbers from two sources is one
  // too many: the header's `filesChanged`, the CHANGED FILES list and the panel's total now all come
  // from `files`. What budgeting genuinely knows — how many files it had to drop or cut — is kept,
  // and only the total it was measured against is re-based.
  const unread = coverage.filesTotal - coverage.filesRead
  return { ...coverage, filesTotal: files.length, filesRead: Math.max(0, files.length - unread) }
}

/** Streaming feature: turn one commit's message + diff into a short markdown explanation of what it
 * actually does, token by token. */
export const commitExplanationFeature: StreamingFeature<CommitExplanationInput> = {
  id: 'commit-explanation',
  kind: 'streaming',
  instruction: COMMIT_EXPLANATION_INSTRUCTION,
  // Same as the other explanation features: describing existing code wants reproducibility.
  temperature: 0.2,
  buildPrompt: buildCommitExplanationPrompt,
}
