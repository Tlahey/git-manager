import type {
  AiActivity,
  AiCheckConfig,
  AiCommitScan,
  AiContext,
  AiContextScope,
  AiGenerateConfig,
  AiTransport,
  JsonSchema,
} from '@git-manager/ai'
import {
  changeExplanationFeature,
  codeReviewFeature,
  commitRecomposeFeature,
  commitFileScanFeature,
  commitQuickScanFeature,
  commitRelevanceFeature,
  commitSearchAnswerFeature,
  upgradeRiskFeature,
  createCompletionService,
  createStatusService,
  createStreamingService,
  dailySummaryFeature,
  fileSummaryFeature,
  summaryPrDescriptionFeature,
  summaryCommitMessageFeature,
  summaryExplanationFeature,
  summaryGroupingFeature,
  summarySearchFeature,
} from '@git-manager/ai'
import {
  aiComplete,
  aiGenerateStream,
  cancelGeneration,
  checkAiStatus,
  getAiActivity,
  getAiCommitScan,
  getAiContext,
  getModelContextLimits,
  type ModelContextLimits,
} from '../lib/tauri'
import { withAiActivity, type AiRunOrigin } from '../stores/aiActivity.store'
import { useRepoUIStore } from '../stores/repoUI.store'
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

/** Gathers the repo's commit activity for one local calendar day (`sinceEpoch`…`untilEpoch`, in
 * seconds) + the current uncommitted work, for the daily-summary feature's prompt. The window
 * follows the first resolvable entry of `candidates` (the repo's main branch), not HEAD — see
 * `services/ai_activity.rs`. */
export async function apiGetAiActivity(
  path: string,
  sinceEpoch: number,
  untilEpoch: number,
  candidates: string[]
): Promise<AiActivity> {
  return getAiActivity(path, sinceEpoch, untilEpoch, candidates)
}

/** Lists the commits an AI search will read (last `sinceHours`, newest first, at most `maxCommits`),
 * each with its full oid and touched paths. The diffs are *not* here: the search fetches each
 * commit's patch as it reaches it, so a month of history never sits in memory at once. */
export async function apiGetAiCommitScan(path: string, maxCommits?: number): Promise<AiCommitScan> {
  return getAiCommitScan(path, maxCommits)
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
/**
 * Where the generation about to start is being watched from, if anywhere.
 *
 * Read here rather than declared by each feature because this is the one place every generation
 * passes through, and because the answer is already on screen: at the instant a run begins, the
 * panel the user just clicked in is the open one. A run started with no repository (the morning
 * summary, which runs before any tab is chosen) gets no origin, and the footer keeps its old
 * behaviour of opening Settings.
 */
function currentAiOrigin(): AiRunOrigin | undefined {
  const { activeRepo, activeWorkspacePath, aiPanelTarget } = useRepoUIStore.getState()
  const repoPath = activeWorkspacePath ?? activeRepo
  if (!repoPath) return undefined
  return { repoPath: activeRepo ?? repoPath, panel: aiPanelTarget ?? undefined }
}

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
      const result = await withAiActivity(featureId, call, currentAiOrigin())
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
/**
 * The map half every two-phase feature shares: one small call describing one file, sequenced by
 * `summarizeFiles`.
 *
 * There is no single-prompt alternative beside it any more. Two features used to keep one and pick
 * between them on a file-count threshold, which meant the same button did two different things
 * depending on a number nobody could see — so a bad answer could not be reasoned about without first
 * working out which path produced it. See `docs/ai/file-grouping.md`.
 */
export const fileSummaryService = createCompletionService(
  fileSummaryFeature,
  trackedTransport(fileSummaryFeature.id)
)
export const summaryGroupingService = createCompletionService(
  summaryGroupingFeature,
  trackedTransport(summaryGroupingFeature.id)
)
/** The reduce half of the commit message: writes it from the per-file summaries. Keeps
 * `COMMIT_MESSAGE_SCHEMA` and its parser, which is what stops a reasoning model's deliberation
 * reaching the commit box. */
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
/** The reduce half of the daily briefing: writes it from the per-file summaries of everything that
 * landed on the main branch in the window. */
export const dailySummaryService = createCompletionService(
  dailySummaryFeature,
  trackedTransport(dailySummaryFeature.id)
)
/** Answers a question about the archived briefings, over the shortlist the local scorer produced.
 * One bounded call, not a retrieval system — see `summarySearch.ts` for why. */
export const summarySearchService = createCompletionService(
  summarySearchFeature,
  trackedTransport(summarySearchFeature.id)
)
/** Kept apart from the explanation service rather than folded in as a fourth scope: a PR body has a
 * different reader, a template whose headings must survive verbatim, and it gets published. */
export const summaryPrDescriptionService = createStreamingService(
  summaryPrDescriptionFeature,
  trackedTransport(summaryPrDescriptionFeature.id)
)
export const changeExplanationService = createStreamingService(
  changeExplanationFeature,
  trackedTransport(changeExplanationFeature.id)
)
/** One service for both explanation scopes: the feature discriminates on its input's `scope`, so a
 * branch and a commit share an instruction, a temperature and this line — the same arrangement the
 * code review uses across its own two scopes. Both are fed by `summarizeFiles` first. */
export const summaryExplanationService = createStreamingService(
  summaryExplanationFeature,
  trackedTransport(summaryExplanationFeature.id)
)
/** The map half of the AI commit search: one small verdict per commit, sequenced by `scanCommits`.
 * A completion with a schema for the same reason the file summary is one — the caller needs a field
 * it can branch on, not prose it has to interpret. */
export const commitRelevanceService = createCompletionService(
  commitRelevanceFeature,
  trackedTransport(commitRelevanceFeature.id)
)
/** Judges what a dependency upgrade would break *in this repo*, from the release notes
 * crossed with the repo's own import sites. Advisory only — the updates page keeps its
 * confirmation on a major whatever this returns. */
export const upgradeRiskService = createCompletionService(
  upgradeRiskFeature,
  trackedTransport(upgradeRiskFeature.id)
)
/** The quick search's first narrowing: one call over every commit's message, no diffs, no loop. */
export const commitQuickScanService = createCompletionService(
  commitQuickScanFeature,
  trackedTransport(commitQuickScanFeature.id)
)
/** Its second: one call over a shortlisted commit's paths, deciding which of them to open. */
export const commitFileScanService = createCompletionService(
  commitFileScanFeature,
  trackedTransport(commitFileScanFeature.id)
)
/** The reduce half: the answer itself, streamed, written from every commit's verdict. */
export const commitSearchAnswerService = createStreamingService(
  commitSearchAnswerFeature,
  trackedTransport(commitSearchAnswerFeature.id)
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
