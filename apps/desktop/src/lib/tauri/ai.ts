import { invoke } from './invoke'
import type { StoredSummaryFile } from '@git-manager/git-types'
import type {
  AiProviderStatus,
  AiCheckConfig,
  AiGenerateConfig,
  AiContext,
  AiContextScope,
  AiActivity,
  AiCommitScan,
  JsonSchema,
} from '@git-manager/ai'

// ─── AI ───────────────────────────────────────────────────────────────────────

export const checkAiStatus = (config: AiCheckConfig) =>
  invoke<AiProviderStatus>('check_ai_status', { config })

/** Asks the provider what a model's context window really is. Ollama-only; every field comes back
 * unset when the provider has nothing to say, which is a normal answer rather than a failure. */
/** Mirrors the Rust `ModelContextLimits` serde struct. */
export interface ModelContextLimits {
  /** The model architecture's own maximum, in tokens — a hard ceiling. */
  architectureMax: number | null
  /** `num_ctx` pinned in the model's Modelfile, when it pins one. */
  modelfileNumCtx: number | null
  /** The window the server actually allocated for this model, in tokens — only reported while the
   * model is loaded, and the only one of the three that reflects a server-side
   * `OLLAMA_CONTEXT_LENGTH`. */
  allocatedContext: number | null
  /** `max_model_len` from the OpenAI-compatible `/v1/models` entry. Non-standard, so usually null;
   * omlx reports it, which is what lets a user there stop guessing at the window. */
  servedMaxModelLen: number | null
}

/** No API key argument: the backend reads it from the OS keychain, like every other AI call. */
export const getModelContextLimits = (url: string, model: string) =>
  invoke<ModelContextLimits>('get_model_context_limits', { url, model })

export const getAiContext = (
  path: string,
  scope: AiContextScope,
  baseRef?: string,
  // `range` scope only: the branch/ref the range ends at. Defaults to HEAD on the backend, so
  // explaining a branch that isn't checked out is the only caller that passes it.
  headRef?: string
) =>
  invoke<AiContext>('get_ai_context', {
    path,
    scope,
    baseRef: baseRef ?? null,
    headRef: headRef ?? null,
  })

/** `sinceEpoch`/`untilEpoch` bound one local calendar day in epoch seconds; `candidates` is the
 * ordered main-branch list (`origin/main`, `origin/master`, …), so the window is taken over that
 * branch and not over whatever is checked out. */
export const getAiActivity = (
  path: string,
  sinceEpoch: number,
  untilEpoch: number,
  candidates: string[]
) => invoke<AiActivity>('get_ai_activity', { path, sinceEpoch, untilEpoch, candidates })

/** Writes one morning's briefing to the markdown archive, returning the path written. */
export const saveDailySummary = (
  repoPath: string,
  date: string,
  markdown: string,
  alsoInRepo: boolean
) => invoke<string>('save_daily_summary', { repoPath, date, markdown, alsoInRepo })

/** Reads the whole archive — every repository, every retained day — newest first. */
export const listDailySummaries = () => invoke<StoredSummaryFile[]>('list_daily_summaries')

export const deleteDailySummary = (filePath: string) =>
  invoke<void>('delete_daily_summary', { filePath })

/** Reveals the archive directory (`~/.git-manager/summaries/`) in the Finder. */
export const openDailySummariesDir = () => invoke<void>('open_daily_summaries_dir')

/** The commits an AI search will read, newest first, each with its full oid and touched paths.
 * `maxCommits` bounds the scan — every commit returned costs one model call. */
export const getAiCommitScan = (path: string, maxCommits?: number) =>
  invoke<AiCommitScan>('get_ai_commit_scan', {
    path,
    // The optional time bound the command still accepts is deliberately unused: it can only ever
    // return *fewer* commits than the count asked for, and the count is the one that must bind
    // because it is what the run costs. See `ai_commit_scan.rs`.
    sinceHours: null,
    maxCommits: maxCommits ?? null,
  })

/** `requestId` tags every `ai:*` event this generation emits, and is what {@link cancelGeneration}
 * targets. The events are window-wide broadcasts, so without it a second generation started while
 * the first streams receives the first's tokens. */
export const aiGenerateStream = (
  config: AiGenerateConfig,
  systemPrompt: string,
  userPrompt: string,
  requestId: string
) => invoke<void>('ai_generate_stream', { config, systemPrompt, userPrompt, requestId })

/** `requestId` names this completion in the backend's generation registry, and is what
 * {@link cancelGeneration} targets — the same registry and the same kind of id as a stream's. It is
 * required, not optional: a completion with no id could not be stopped, which is what let a
 * cancelled AI search go on talking to the model for another minute. See `commands/ai.rs`. */
export const aiComplete = (
  config: AiGenerateConfig,
  systemPrompt: string,
  userPrompt: string,
  schema: JsonSchema | undefined,
  requestId: string
) => invoke<string>('ai_complete', { config, systemPrompt, userPrompt, schema, requestId })

/** Cancels one call — streaming or completion — by the id its caller minted. An id that has already
 * finished is a no-op on the Rust side — hitting stop as the last token lands is a normal race. */
export const cancelGeneration = (requestId: string) =>
  invoke<void>('cancel_generation', { requestId })
