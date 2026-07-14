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
  commitMessageFeature,
  createCompletionService,
  createStatusService,
  createStreamingService,
  dailySummaryFeature,
  fileGroupingFeature,
} from '@git-manager/ai'
import {
  aiComplete,
  aiGenerateStream,
  cancelGeneration,
  checkAiStatus,
  getAiActivity,
  getAiContext,
} from '../lib/tauri'

export async function apiCheckAiStatus(config: AiCheckConfig) {
  return checkAiStatus(config)
}

/** Snapshots the repo's uncommitted changes so a feature can build its prompt from them. */
export async function apiGetAiContext(path: string, scope: AiContextScope): Promise<AiContext> {
  return getAiContext(path, scope)
}

/** Gathers the repo's recent commit activity (last `sinceHours`) + uncommitted work for the
 * daily-summary feature's prompt. */
export async function apiGetAiActivity(path: string, sinceHours: number): Promise<AiActivity> {
  return getAiActivity(path, sinceHours)
}

export async function apiCancelGeneration() {
  return cancelGeneration()
}

/** Tauri-backed transport for `@git-manager/ai`'s runtime — the invoke wrappers are the only place
 * IPC touches AI, keeping the package Tauri-agnostic. `runStream` triggers a streaming generation
 * whose tokens arrive via `ai:token`/`ai:done` events (see `useAiGeneration`); `runComplete`
 * resolves with the full response for structured features. */
const tauriAiTransport: AiTransport = {
  runStream: (config: AiGenerateConfig, systemPrompt: string, userPrompt: string) =>
    aiGenerateStream(config, systemPrompt, userPrompt),
  runComplete: (
    config: AiGenerateConfig,
    systemPrompt: string,
    userPrompt: string,
    schema?: JsonSchema
  ) => aiComplete(config, systemPrompt, userPrompt, schema),
  checkStatus: apiCheckAiStatus,
  cancel: apiCancelGeneration,
}

/** One service per AI feature, each assembled from its package-owned descriptor (instruction +
 * temperature + prompt) and the shared transport. Adding a future feature (report generation, git
 * command explanation, …) is: define it in `@git-manager/ai`, then add one line here. */
export const commitMessageService = createStreamingService(commitMessageFeature, tauriAiTransport)
export const fileGroupingService = createCompletionService(fileGroupingFeature, tauriAiTransport)
export const dailySummaryService = createCompletionService(dailySummaryFeature, tauriAiTransport)

/** Connection health check for Settings (validates a provider and lists its models). */
export const aiStatusService = createStatusService(tauriAiTransport)
