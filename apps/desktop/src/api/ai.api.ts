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
  createCompletionService,
  createStatusService,
  createStreamingService,
  dailySummaryFeature,
  fileGroupingFeature,
  prDescriptionFeature,
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
  model: string
): Promise<ModelContextLimits> {
  return getModelContextLimits(url, model)
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
  return {
    ...tauriAiTransport,
    runStream: (config, systemPrompt, userPrompt, requestId) =>
      withAiActivity(featureId, () =>
        tauriAiTransport.runStream(config, systemPrompt, userPrompt, requestId)
      ),
    runComplete: (config, systemPrompt, userPrompt, schema) =>
      withAiActivity(featureId, () =>
        tauriAiTransport.runComplete(config, systemPrompt, userPrompt, schema)
      ),
  }
}

/** One service per AI feature, each assembled from its package-owned descriptor (instruction +
 * temperature + prompt) and the shared transport. Adding a future feature (report generation, git
 * command explanation, …) is: define it in `@git-manager/ai`, then add one line here. */
export const commitMessageService = createStreamingService(
  commitMessageFeature,
  trackedTransport(commitMessageFeature.id)
)
export const fileGroupingService = createCompletionService(
  fileGroupingFeature,
  trackedTransport(fileGroupingFeature.id)
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
