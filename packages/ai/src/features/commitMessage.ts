import type { AiContextFile, JsonSchema } from '../config'

/** The instruction (system prompt) for commit-message generation. Lives here in `@git-manager/ai`
 * — the single home for the app's AI logic — rather than in the Rust provider (a dumb transport)
 * or the app's Settings (the user no longer edits instructions).
 *
 * The rules about a partial diff read oddly on a feature whose entire output is one line, and they
 * are the ones that matter most. This output is **committed**: it goes into the repository's history
 * under the user's name, immutably, and gets read by everyone who runs `git log` afterwards. A
 * parenthesis like "(diff truncated)" is not a caveat here, it is a permanent artifact of the tool
 * that wrote the message — and the user, who is looking at a subject line and not at a prompt, has
 * no idea where it came from. The other half is the scope: told only what it could read, the model
 * writes `fix(ui)` for a change that also rewrote the backend, which is worse than a vague subject
 * because it is confidently wrong. So the omitted paths are named, and the subject is required to
 * cover them. */
export const COMMIT_MESSAGE_INSTRUCTION = `You are an expert software engineer writing a single Git commit message for a set of STAGED changes, following the Conventional Commits specification.

Answer with a JSON object carrying two fields, "subject" and "body".

Rules (STRICT):
- "subject" is the subject line, normally <type>(<scope>): <description>
  - <type> is chosen by intent: feat (new capability), fix (bug fix), refactor (behavior-preserving restructure), perf, docs, style, test, build, ci, chore.
  - <scope> is optional, lower-case, derived from the touched area (a module or directory); omit it when the change spans unrelated areas.
  - <description> is in the imperative mood ("add", "fix", "remove" — never "added"/"adds"), starts lower-case, has no trailing period, and AIMS FOR 50 characters. Count the characters before answering and shorten the wording rather than run past the ceiling — 72 unless the prompt states a different one for this project.
  - When the prompt shows recent subjects that do NOT follow this format, match those instead — the project's own convention wins.
- "body" carries rationale the subject cannot convey, wrapped around 72 columns, explaining the "why" and not the "what". Use an EMPTY STRING when the change needs none; most changes do not. When you do write one, keep it under three sentences and explain WHY the change was made — never restate what the diff already shows.
- Put NOTHING but the message in those two fields — no preamble, no commentary about the diff, no code fences, no surrounding quotes, and no reasoning about how you chose them.
- The prompt may list files under "NOT INCLUDED" whose diff you were not shown. They are part of this commit: let their paths inform the type and scope, and never pick a scope that describes only the files you could read.
- This message will be COMMITTED to the repository's history. NEVER mention truncation, budgets, or what you could not read — not in the subject, not in the body, not in a parenthesis.
- A diff shows only a few lines around each change. NEVER state that something is missing, absent, or not done merely because you cannot see it — a guard, a call site, or a test may sit just outside what you were shown. Absence of evidence is not evidence of absence.

Types: feat, fix, refactor, perf, docs, style, test, build, ci, chore.`

/**
 * JSON Schema constraining the answer to a `{ subject, body }` object.
 *
 * The schema is not here for the typing — a commit message is one string, and this feature streamed
 * it as prose for most of its life. It is here because **grammar-constrained decoding is the only
 * reliable way to stop a reasoning model from thinking into the answer**.
 *
 * The failure it fixes, measured against a local Qwen 35B-A3B on omlx: asked in prose, the model
 * spent 2255 tokens deliberating before writing anything. The `max_tokens` cap
 * ({@link RESERVED_OUTPUT_TOKENS}, 600) cut that off mid-thought, so the server never saw the end of
 * the reasoning block, gave up separating it, and flushed 2222 characters of "Thinking Process: 1.
 * **Analyze the Request**…" into `content` — straight into the user's commit box. Under this schema
 * the same request answers in 37-52 tokens with no reasoning phase at all, because the grammar
 * obliges the very first token to be `{`.
 *
 * That also makes the output budget a non-issue rather than a number to tune: an answer that never
 * approaches the cap cannot be truncated by it. Asking the provider not to think is not an
 * alternative — `enable_thinking: false` is ignored by some servers (LM Studio #1990) and Qwen 3.5+
 * dropped the `/no_think` switch, so suppression cannot be relied on across the presets we ship.
 *
 * `body` is a plain string rather than a nullable one: `type: ["string", "null"]` is refused by
 * several strict-mode implementations, and "" already means "no body".
 *
 * **`subject` deliberately carries no `maxLength`, and this is not an oversight.** The 72-character
 * limit is real and the validator reports it, so constraining it here looks obvious. It was measured
 * instead: omlx *does* enforce `maxLength: 72`, by forbidding any token that would cross the
 * boundary — which means the model does not shorten its wording, it simply gets cut off. Six samples
 * produced `…to grammar-constrained JS`, `…with JSON schema, d`, `…completion, not a`. A subject
 * mangled mid-word is committed to history exactly as permanently as an over-long one, and unlike an
 * over-long one it is unreadable. The limit is therefore steered from the instruction (which asks
 * for ~50 characters, so the natural overshoot still lands under the ceiling) and reported by
 * {@link validateCommitSubject} when the model misses — a warning the user can act on beats a
 * guarantee that damages the answer.
 */
export const COMMIT_MESSAGE_SCHEMA: JsonSchema = {
  name: 'commit_message',
  schema: {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        description:
          'The commit subject line. Aim for 50 characters and never exceed 72. No trailing newline or period.',
      },
      body: {
        type: 'string',
        description:
          'Rationale explaining WHY the change was made, under three sentences. Empty string when the subject says enough.',
      },
    },
    required: ['subject', 'body'],
    additionalProperties: false,
  },
  strict: true,
}

/**
 * Default character budget, kept for {@link truncateDiff}'s own callers.
 *
 * The commit message no longer uses it: its diff now follows the model's declared window like every
 * other feature's. What survives is the helper itself, which {@link budgetDiff} falls back to for
 * text carrying no `diff --git` header — a blind cut is still better than sending nothing.
 */
const MAX_DIFF_CHARS = 4000

/** Truncates an oversized diff so the prompt stays within a reasonable token budget, appending a
 * marker so the model knows it saw only a prefix. */
export function truncateDiff(diff: string, maxChars = MAX_DIFF_CHARS): string {
  if (diff.length <= maxChars) return diff
  return `${diff.slice(0, maxChars)}\n\n[diff truncated, showing first ${maxChars} chars]`
}

/** "Group by first path segment" heuristic: if every changed file shares the same top-level
 * directory that's a reasonable scope hint; if they span multiple, leave it to the model rather
 * than forcing a misleading scope. (Formerly `detect_scope` in the Rust provider.) */
export function detectScope(files: AiContextFile[]): string | undefined {
  const segments = files.map((f) => f.path.split('/')[0])
  if (segments.length === 0) return undefined
  const [first] = segments
  return segments.every((s) => s === first) ? first : undefined
}

/** The model's answer, before it is flattened into the one string git wants. */
export interface CommitMessageDraft {
  /** The subject line, always non-empty (a draft without one is rejected by {@link parseCommitMessage}). */
  subject: string
  /** Rationale, or `''` when the subject says enough. */
  body: string
}

/** Collapses a draft into the `subject\n\nbody` form git expects, dropping the separator when there
 * is no body. The commit box receives this string, so it must be exactly what gets committed. */
export function formatCommitMessage(draft: CommitMessageDraft): string {
  const subject = draft.subject.trim()
  const body = draft.body.trim()
  return body ? `${subject}\n\n${body}` : subject
}

/**
 * Parses the model's response into a {@link CommitMessageDraft}.
 *
 * Tolerates prose or a ```json fence around the object, like the other structured features: the
 * schema is a request, not a guarantee, and a provider that ignores `response_format` still usually
 * returns the object somewhere in its text.
 *
 * The fallback matters more here than elsewhere. When there is no JSON at all, an older provider
 * answering this feature's prompt in prose returned a perfectly good commit message — so rather than
 * fail, the raw text is taken as the subject, which is what this feature did for its whole streaming
 * life. What is *not* tolerated is an empty answer: silently committing `''` is worse than an error.
 */
export function parseCommitMessage(raw: string): CommitMessageDraft {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')

  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1))
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as Record<string, unknown>
        const subject = typeof record.subject === 'string' ? record.subject.trim() : ''
        const body = typeof record.body === 'string' ? record.body.trim() : ''
        if (subject) return { subject, body }
      }
    } catch {
      // Falls through to the prose reading below — a malformed object is not worse than no object.
    }
  }

  const prose = raw.trim()
  if (!prose) throw new Error('AI commit message response was empty')

  const [subject, ...rest] = prose.split('\n')
  return { subject: subject.trim(), body: rest.join('\n').trim() }
}
