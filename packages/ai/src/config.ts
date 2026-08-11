import type { AiProtocol } from './presets'

/** Persisted shape of `AppSettings.ai`. Deliberately connection-only: the provider preset, its
 * URL/model/key and a request timeout. Everything that shapes *what the model is asked to do* —
 * the instruction (system prompt), the temperature, how the prompt is built — is owned per-feature
 * inside this package (see `features/`), NOT exposed in the app's Settings. Adding a knob here
 * should only ever be about *reaching* a provider, never about tuning a feature. */
export interface AiConnectionConfig {
  preset: import('./presets').AiPresetId
  url: string
  model: string
  apiKey?: string
  timeoutSeconds: number
  /**
   * The model's context window, in tokens. A property of the model you are reaching — like the
   * timeout — not a tuning knob for any feature, which is why it belongs here.
   *
   * Declared, not negotiated: no *generation* protocol the app speaks carries a context length —
   * Ollama's OpenAI-compatible endpoint has no `num_ctx` and no `options` at all. It can however be
   * *verified* out of band, against Ollama's native `/api/show` and `/api/ps` (see the check button
   * in Settings → AI, and `services/ai_model_info.rs`), which is what turns a guess into a value the
   * user has been told is right or wrong.
   *
   * Features use it to size their prompts, so a provider never silently drops the *start* of an
   * oversized one — see `promptSize.ts`. `undefined` falls back to {@link DEFAULT_CONTEXT_TOKENS}.
   */
  contextTokens?: number
  /**
   * Optional second model, used only by the features that declare `tier: 'fast'`.
   *
   * Exactly one kind of call qualifies today: the per-file summary, which seven features run once
   * per changed file. It is the app's highest-volume call and its least demanding — describe one
   * file in two short clauses — so on a thirty-file changeset this moves thirty of the thirty-one
   * calls off the main model.
   *
   * What it deliberately is **not** is a "light model for repetitive work" knob. The commit search's
   * per-commit verdict is also a per-item loop, and it is the one call where a weaker model produces
   * confident wrong answers about your own history. Which calls may use this is a property of the
   * feature, declared next to its instruction and temperature, never assigned by the user.
   *
   * Same URL, same API key: this only swaps the model name, so the fast model has to be served by
   * the same provider. Unset (the default) means every feature uses {@link model}.
   */
  fastModel?: string
  /**
   * How many model calls the map phases may have in flight at once.
   *
   * A property of the server you are reaching — like the timeout and the context window — and not of
   * any feature, which is what puts it here. Whether it helps is decided entirely by the provider's
   * scheduler: one that serialises (Ollama's default, one generation per model unless
   * `OLLAMA_NUM_PARALLEL` says otherwise) gains nothing, while one doing continuous batching folds
   * several requests into the same forward pass and gets measurably faster.
   *
   * `undefined` means {@link DEFAULT_AI_CONCURRENCY} — one, the behaviour before the setting existed.
   * Raising it is a bet on the user's own server, which is why Settings tells them to measure rather
   * than guessing on their behalf. See `features/mapConcurrently.ts` for the trade it buys.
   */
  concurrency?: number
  /**
   * Extra top-level fields merged into every request body, as the user typed them.
   *
   * The escape hatch for what the OpenAI-compatible surface does not standardise — above all
   * switching a reasoning model's deliberation off, which has at least four spellings and no
   * agreement between servers: `reasoning_effort` is in the spec, `chat_template_kwargs` is what
   * vLLM/SGLang take and what Qwen's own model card documents, `think` is Ollama's native API. The
   * app cannot send all of them (an unknown field is a 400 on a strict server) and cannot pick one,
   * so the user names whichever their server understands.
   *
   * A property of the provider being reached, like the timeout and the window — never a way to tune
   * a feature. The app's own fields are merged *over* these, so `model`, `messages`, `stream`,
   * `max_tokens` and `response_format` cannot be replaced from here: a feature's JSON schema or a
   * stream's framing silently swapped out would break it with no error anyone could trace back.
   */
  extraBody?: Record<string, unknown>
  /** Whether the user has turned AI features on. UI/feature gate (e.g. the AI-commit settings
   * section), not part of the transport — `undefined` is treated as enabled for back-compat. */
  enabled?: boolean
}

/** Generalizes the old, Ollama-only `OllamaStatus`. */
export interface AiProviderStatus {
  connected: boolean
  models: string[]
  version?: string | null
  /** Short technical diagnostic when `connected` is false — the exact URL that was probed plus the
   * HTTP status or transport error. Settings surfaces it verbatim, because "not connected" alone
   * can't distinguish a wrong port from a base URL missing (or duplicating) its `/v1` segment. */
  detail?: string | null
}

/** Wire shape for the `check_ai_status` Tauri command — just enough to open a connection. */
export interface AiCheckConfig {
  protocol: AiProtocol
  url: string
  apiKey?: string
}

/** Wire shape for the generic `ai_generate_stream` / `ai_complete` Tauri commands' `config`
 * argument. It carries the resolved `protocol` the backend dispatches on plus the per-request
 * `temperature` the *feature* chose — the backend is a dumb transport and owns none of this. */
export interface AiGenerateConfig {
  protocol: AiProtocol
  url: string
  model: string
  apiKey?: string
  temperature: number
  timeoutSeconds: number
  /**
   * Hard cap on the model's own answer, in tokens, sent as `max_tokens`.
   *
   * The other half of prompt sizing, and the half that was missing: every feature subtracts
   * {@link RESERVED_OUTPUT_TOKENS} from its prompt budget so the answer has somewhere to go, but
   * nothing obliged the model to stay inside that room. An answer that ran past it overflowed the
   * window the prompt had been carefully sized against — and an overflow drops the *start*, which is
   * the instruction. Resolved from the same constant, never chosen per call site.
   */
  maxTokens: number
  /** The user's own extra request fields, passed through verbatim; see `AiConnectionConfig`. */
  extraBody?: Record<string, unknown>
}

/** A JSON Schema object (draft-07-ish) describing the shape a structured-output feature expects
 * back. Passed through to the provider, which asks the model to conform to it via the OpenAI
 * `response_format: { type: "json_schema" }` surface (supported by Ollama/LM Studio/OpenAI). */
export type JsonSchema = Record<string, unknown>

/** Which state a git-context request should snapshot. `staged` = index vs HEAD (what a plain commit
 * would capture); `working` = worktree vs HEAD (everything uncommitted, for grouping into several
 * commits); `range` = `merge-base(base, HEAD)..HEAD` (a whole branch's changes vs its base, for a
 * PR description — requires a base ref). Mirrors the Rust `AiContextScope`. */
export type AiContextScope = 'staged' | 'working' | 'range'

/** One changed file in an {@link AiContext}. `status` is git's short status word
 * (`added`/`modified`/`deleted`/`renamed`/`untracked`). */
export interface AiContextFile {
  path: string
  status: string
}

/** The project's own commit-message convention, discovered from the repo (a commitlint config, a
 * `commitlint` key in package.json, or a git `commit.template`). Mirrors the Rust
 * `CommitConvention`. `content` is the raw config text — features feed it to the model so generated
 * messages conform, and the lightweight validator parses it when it can. */
export interface CommitConvention {
  source: string
  content: string
}

/** Everything about the repo's current state a feature's prompt might need — produced by the
 * `get_ai_context` Tauri command (git2 logic stays in Rust) and handed to a feature's
 * `buildPrompt`. Mirrors the Rust `AiContext` serde struct. */
export interface AiContext {
  diff: string
  repoName: string
  branch: string
  files: AiContextFile[]
  /** The project's commit convention when it defines one, else `undefined`/`null`. */
  commitConvention?: CommitConvention | null
  /** Subjects of the last few non-merge commits (newest first) — a sample of the project's actual
   * commit style, used both to guide the model and to infer how to validate generated messages. */
  recentCommits?: string[]
  /** User-authored commit guidance from app Settings (free text). Frontend-populated (not from
   * Rust) — an authoritative style source injected into the prompt. */
  commitInstructions?: string
  /** Optional regex (from Settings) the generated subject must match. Frontend-populated. */
  commitPattern?: string
  /** The base branch a `range`-scope context was diffed against (only set for `range`). */
  baseRef?: string
  /** Subjects of every non-merge commit in `base..HEAD`, newest first — the commits a PR would
   * contain (only set for `range` scope). */
  rangeCommits?: string[]
}

/** One commit in an {@link AiActivity} window. Mirrors the Rust `ActivityCommit` serde struct. */
export interface AiActivityCommit {
  shortOid: string
  subject: string
  /** Commit body (message minus the subject line), trimmed; empty when subject-only. */
  body: string
  author: string
  /** Author timestamp, seconds since the epoch. */
  timestamp: number
  filesChanged: number
  insertions: number
  deletions: number
}

/** One uncommitted change in an {@link AiActivity}'s `pending` snapshot. */
export interface AiActivityPending {
  path: string
  status: string
}

/** Recent-activity context for the daily-summary feature — produced by the `get_ai_activity` Tauri
 * command (git2 logic stays in Rust). Looks *backwards* (commits authored in a recent window) plus a
 * light snapshot of the still-uncommitted work. Mirrors the Rust `AiActivity` serde struct. */
export interface AiActivity {
  repoName: string
  /** The branch the window was taken over: the resolved main-branch candidate (`origin/main`), or
   * the checked-out branch when none of the candidates exists. */
  branch: string
  /** Non-merge commits authored within the requested window, newest first. */
  commits: AiActivityCommit[]
  /** Light snapshot of uncommitted work (staged + unstaged + untracked). May be empty. */
  pending: AiActivityPending[]
  /** True when the window held more commits than the backend cap, so the summary is a sample. */
  truncated: boolean
  /** The commit the window starts from — pair with {@link headOid} to fetch the window's diff at
   * `range` scope. `null` when the window held no commits. */
  baseOid: string | null
  /** The newest commit in the window. `null` when the window held no commits. */
  headOid: string | null
  /** BCP-47-ish language tag (`'fr'` / `'en'` / `'es'`) the summary should be written in. Frontend-populated
   * from app Settings (not from Rust) so the briefing matches the user's UI language. */
  language?: string
}

/** One path a scanned commit touched. Mirrors the Rust `ScanCommitFile` serde struct. */
export interface ScanCommitFile {
  path: string
  status: string
}

/**
 * One commit an AI search will read. Mirrors the Rust `ScanCommit` serde struct.
 *
 * Carries the **full** `oid`, unlike {@link AiActivityCommit}: the search fetches each commit's own
 * patch before asking about it, and a seven-character prefix is not what `get_commit_diff` takes.
 */
export interface ScanCommit {
  oid: string
  shortOid: string
  subject: string
  /** Commit body (message minus the subject line), trimmed; empty when subject-only. */
  body: string
  author: string
  /** Author timestamp, seconds since the epoch. */
  timestamp: number
  files: ScanCommitFile[]
  /** True when the commit touched more paths than `files` lists. */
  filesTruncated: boolean
  insertions: number
  deletions: number
  parentCount: number
}

/** The commit window an AI search reads — produced by the `get_ai_commit_scan` Tauri command (git2
 * logic stays in Rust). Mirrors the Rust `AiCommitScan` serde struct. */
export interface AiCommitScan {
  repoName: string
  branch: string
  /** Non-merge commits authored within the window, newest first. */
  commits: ScanCommit[]
  /** True when history holds commits older than the ones returned — i.e. the cap stopped the walk
   * rather than the repository running out. What makes "not found" mean "not in what was read". */
  truncated: boolean
  /** Author timestamp of the oldest commit returned, seconds since the epoch; absent when none. */
  oldestEpoch?: number
  /** Author timestamp of the newest commit returned, seconds since the epoch; absent when none. */
  newestEpoch?: number
}
