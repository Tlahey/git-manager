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
  /** Whether the user has turned AI features on. UI/feature gate (e.g. the AI-commit settings
   * section), not part of the transport — `undefined` is treated as enabled for back-compat. */
  enabled?: boolean
}

/** Generalizes the old, Ollama-only `OllamaStatus`. */
export interface AiProviderStatus {
  connected: boolean
  models: string[]
  version?: string | null
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
  branch: string
  /** Non-merge commits authored within the requested window, newest first. */
  commits: AiActivityCommit[]
  /** Light snapshot of uncommitted work (staged + unstaged + untracked). May be empty. */
  pending: AiActivityPending[]
  /** True when the window held more commits than the backend cap, so the summary is a sample. */
  truncated: boolean
  /** BCP-47-ish language tag (`'fr'` / `'en'`) the summary should be written in. Frontend-populated
   * from app Settings (not from Rust) so the briefing matches the user's UI language. */
  language?: string
}
