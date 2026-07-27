import type {
  AiActivity,
  AiCheckConfig,
  AiContext,
  AiContextScope,
  AiGenerateConfig,
  AiTransport,
  JsonSchema,
} from '@git-manager/ai'
import {
  branchExplanationFeature,
  changeExplanationFeature,
  codeReviewFeature,
  commitExplanationFeature,
  commitMessageFeature,
  commitRecomposeFeature,
  createCompletionService,
  createStatusService,
  createStreamingService,
  dailySummaryFeature,
  fileGroupingFeature,
  fileSummaryFeature,
  prDescriptionFeature,
  summaryCommitMessageFeature,
  summaryGroupingFeature,
  workingExplanationFeature,
} from '@git-manager/ai'
import {
  aiComplete,
  aiGenerateStream,
  cancelGeneration,
  checkAiStatus,
  getAiActivity,
  getAiContext,
  getModelContextLimits,
  type ModelContextLimits,
} from '../lib/tauri'
import { withAiActivity } from '../stores/aiActivity.store'
import { recordAiTranscript } from '../lib/aiTranscriptLog'

export async function apiCheckAiStatus(config: AiCheckConfig) {
  return checkAiStatus(config)
}

/** Snapshots repo changes so a feature can build its prompt. `range` scope requires `baseRef` and
 * diffs `merge-base(baseRef, headRef)..headRef` — the whole branch, for a PR description or a
 * branch explanation. `headRef` defaults to HEAD; pass it to scope the range to a branch that is
 * not checked out. */
export async function apiGetAiContext(
  path: string,
  scope: AiContextScope,
  baseRef?: string,
  headRef?: string
): Promise<AiContext> {
  return getAiContext(path, scope, baseRef, headRef)
}

/** Gathers the repo's recent commit activity (last `sinceHours`) + uncommitted work for the
 * daily-summary feature's prompt. */
export async function apiGetAiActivity(path: string, sinceHours: number): Promise<AiActivity> {
  return getAiActivity(path, sinceHours)
}

/** Sanity-checks the context window declared in Settings against what the provider reports. See
 * `services/ai_model_info.rs` for what this can and cannot prove. */
export async function apiGetModelContextLimits(
  url: string,
  model: string,
  apiKey?: string
): Promise<ModelContextLimits> {
  return getModelContextLimits(url, model, apiKey)
}

/** Cancels one streaming generation by the id it was started with — see {@link tauriAiTransport}. */
export async function apiCancelGeneration(requestId: string) {
  return cancelGeneration(requestId)
}

/** Tauri-backed transport for `@git-manager/ai`'s runtime — the invoke wrappers are the only place
 * IPC touches AI, keeping the package Tauri-agnostic. `runStream` triggers a streaming generation
 * whose tokens arrive via `ai:token`/`ai:done` events (see `useAiGeneration`); `runComplete`
 * resolves with the full response for structured features. */
const tauriAiTransport: AiTransport = {
  runStream: (
    config: AiGenerateConfig,
    systemPrompt: string,
    userPrompt: string,
    requestId: string
  ) => aiGenerateStream(config, systemPrompt, userPrompt, requestId),
  runComplete: (
    config: AiGenerateConfig,
    systemPrompt: string,
    userPrompt: string,
    schema?: JsonSchema
  ) => aiComplete(config, systemPrompt, userPrompt, schema),
  checkStatus: apiCheckAiStatus,
  cancel: apiCancelGeneration,
}

/**
 * The same transport, reporting the generation to `aiActivity.store` for the whole time it runs —
 * which is what lets the footer show that the model is busy.
 *
 * This is the right place to bracket it precisely because every feature funnels through here: one
 * wrapper covers them all, and the next one is instrumented for free. Both Tauri commands resolve
 * when the generation *finishes* (`ai_generate_stream` awaits the provider's whole SSE loop rather
 * than detaching it), so the promise's lifetime is the generation's lifetime — tokens arriving
 * out-of-band as events does not change that.
 */
function trackedTransport(featureId: string): AiTransport {
  /**
   * Runs one call, reporting it to the footer for its whole duration and writing its transcript to
   * disk when it ends — either way.
   *
   * This is also the only layer that *can* record the answer: the `invoke` wrapper's activity log
   * sees arguments, truncated, and never a return value. `read` pulls the response text out of
   * whatever the call resolved with, which is the full answer for a completion and nothing for a
   * stream, whose tokens arrive as events instead.
   */
  async function run<T>(
    config: AiGenerateConfig,
    systemPrompt: string,
    userPrompt: string,
    call: () => Promise<T>,
    read: (result: T) => string | undefined
  ): Promise<T> {
    const start = performance.now()
    const base = { featureId, config, systemPrompt, userPrompt }
    try {
      const result = await withAiActivity(featureId, call)
      recordAiTranscript({
        ...base,
        durationMs: Math.round(performance.now() - start),
        status: 'ok',
        response: read(result),
      })
      return result
    } catch (err) {
      // A failed call is the one most worth having on disk, so it is recorded before rethrowing.
      recordAiTranscript({
        ...base,
        durationMs: Math.round(performance.now() - start),
        status: 'error',
        error: String(err),
      })
      throw err
    }
  }

  return {
    ...tauriAiTransport,
    runStream: (config, systemPrompt, userPrompt, requestId) =>
      run(
        config,
        systemPrompt,
        userPrompt,
        () => tauriAiTransport.runStream(config, systemPrompt, userPrompt, requestId),
        () => undefined
      ),
    runComplete: (config, systemPrompt, userPrompt, schema) =>
      run(
        config,
        systemPrompt,
        userPrompt,
        () => tauriAiTransport.runComplete(config, systemPrompt, userPrompt, schema),
        (raw) => raw
      ),
  }
}

/** One service per AI feature, each assembled from its package-owned descriptor (instruction +
 * temperature + prompt) and the shared transport. Adding a future feature (report generation, git
 * command explanation, …) is: define it in `@git-manager/ai`, then add one line here. */
/** A completion rather than a stream, because the answer is grammar-constrained JSON — which is
 * what keeps a reasoning model's deliberation out of the commit box. See `COMMIT_MESSAGE_SCHEMA`. */
export const commitMessageService = createCompletionService(
  commitMessageFeature,
  trackedTransport(commitMessageFeature.id)
)
export const fileGroupingService = createCompletionService(
  fileGroupingFeature,
  trackedTransport(fileGroupingFeature.id)
)
/** The two halves of the large-changeset planner: one small call per file, then one call that groups
 * the results. Driven by `planCommitsFromSummaries`, which owns the sequencing — these are just the
 * two runners it needs. See `docs/ai/file-grouping.md`. */
export const fileSummaryService = createCompletionService(
  fileSummaryFeature,
  trackedTransport(fileSummaryFeature.id)
)
export const summaryGroupingService = createCompletionService(
  summaryGroupingFeature,
  trackedTransport(summaryGroupingFeature.id)
)
/** The reduce half of the two-phase commit message: writes it from the per-file summaries rather
 * than from a budgeted staged diff. Shares the schema and parser with `commitMessageService`. */
export const summaryCommitMessageService = createCompletionService(
  summaryCommitMessageFeature,
  trackedTransport(summaryCommitMessageFeature.id)
)
/** Rewrites one existing commit's message. A completion, run once per commit the user picked — the
 * review dialog is the interaction, not a stream. */
export const commitRecomposeService = createCompletionService(
  commitRecomposeFeature,
  trackedTransport(commitRecomposeFeature.id)
)
export const dailySummaryService = createCompletionService(
  dailySummaryFeature,
  trackedTransport(dailySummaryFeature.id)
)
export const prDescriptionService = createStreamingService(
  prDescriptionFeature,
  trackedTransport(prDescriptionFeature.id)
)
export const changeExplanationService = createStreamingService(
  changeExplanationFeature,
  trackedTransport(changeExplanationFeature.id)
)
export const branchExplanationService = createStreamingService(
  branchExplanationFeature,
  trackedTransport(branchExplanationFeature.id)
)
export const commitExplanationService = createStreamingService(
  commitExplanationFeature,
  trackedTransport(commitExplanationFeature.id)
)
export const workingExplanationService = createStreamingService(
  workingExplanationFeature,
  trackedTransport(workingExplanationFeature.id)
)
/** One service for both review scopes: the feature discriminates on its input's `scope`, so the
 * working-tree and branch reviews share an instruction, a temperature and this line. */
export const codeReviewService = createStreamingService(
  codeReviewFeature,
  trackedTransport(codeReviewFeature.id)
)

/** Connection health check for Settings (validates a provider and lists its models). Deliberately
 * on the *untracked* transport: its model probe is a one-word round-trip the Settings page already
 * reports inline, and spinning the footer for it would report "the model is working" for something
 * the user is watching a button for. */
export const aiStatusService = createStatusService(tauriAiTransport)
