import type {
  AiCheckConfig,
  AiConnectionConfig,
  AiGenerateConfig,
  AiProviderStatus,
  JsonSchema,
} from './config'
import { getAiPreset } from './presets'
import { RESERVED_OUTPUT_TOKENS } from './promptSize'

/**
 * The extensibility seam of the whole package. An `AiFeature` is a self-contained description of
 * one AI capability: its instruction (system prompt), the temperature it wants, and how it turns
 * some typed `Input` into the user-turn prompt. Adding a new AI feature to the app (report
 * generation, git-command explanation, …) means adding one `AiFeature` value under `features/` and
 * wrapping it with {@link createStreamingService} / {@link createCompletionService} — no backend
 * change, no new Settings knob, no new transport method.
 *
 * Two kinds, matching the two ways the backend can talk to a provider:
 *  - `streaming`  — tokens arrive incrementally via Tauri events (`ai:token`/`ai:done`), for
 *                   interactive text like a commit message.
 *  - `completion` — one awaited response, then parsed into a typed `Output`, for structured
 *                   results like a file→commit grouping.
 */
interface BaseFeature<Input> {
  /** Stable identifier, handy for logging/telemetry-free debugging. */
  id: string
  /** The instruction sent as the system message. Owned here — never surfaced in app Settings. */
  instruction: string
  /** Sampling temperature this feature wants. Owned here — never surfaced in app Settings. */
  temperature: number
  /** Renders the user-turn prompt from typed input (e.g. an {@link AiContext}). */
  buildPrompt(input: Input): string
  /**
   * How much room this feature's answer needs, in tokens. Sent as `max_tokens`; omit to accept
   * {@link RESERVED_OUTPUT_TOKENS}, which is what every prose feature does.
   *
   * It takes the input because for one feature the answer's length is a property of the *question*:
   * a commit plan has to name every changed file verbatim, so a forty-file changeset needs several
   * times the room a five-file one does. A fixed cap would either truncate the JSON mid-array on the
   * large case — a hard parse failure, not a degraded answer — or reserve for the worst case on
   * every call and spend the window on room nobody uses.
   *
   * Whatever this returns must also be what the feature's prompt held back (its sizing's
   * `reservedOutputTokens`). The two numbers are one arithmetic and they are declared apart, which
   * is the one thing to check when adding a feature that sets this.
   */
  reservedOutputTokens?(input: Input): number
}

export interface StreamingFeature<Input> extends BaseFeature<Input> {
  kind: 'streaming'
}

export interface CompletionFeature<Input, Output> extends BaseFeature<Input> {
  kind: 'completion'
  /** Optional JSON Schema for structured output. When set, the provider constrains the model to
   * this shape (OpenAI `response_format: json_schema`), so {@link parse} receives reliable JSON
   * rather than best-effort prose. */
  schema?: JsonSchema
  /** Turns the model's raw text response into the feature's typed output. */
  parse(raw: string): Output
}

export type AiFeature<Input, Output = string> =
  | StreamingFeature<Input>
  | CompletionFeature<Input, Output>

/** The low-level operations a feature service needs from its host. The app provides a Tauri-backed
 * implementation (from `api/ai.api.ts`), keeping this package free of any `@tauri-apps/api`
 * dependency and respecting the repo invariant that `invoke()` only lives in the api layer.
 *
 * `runStream` starts a streaming generation whose tokens are delivered out-of-band, via events the
 * caller listens to; the promise itself resolves when the generation *finishes* (or rejects if it
 * fails), not when the request is accepted — so awaiting it is a valid way to know the model is
 * done, which is what the app's footer activity indicator relies on. `runComplete` resolves with the
 * full response text. Neither knows anything about *which* feature it serves. */
export interface AiTransport {
  runStream(
    config: AiGenerateConfig,
    systemPrompt: string,
    userPrompt: string,
    requestId: string
  ): Promise<void>
  runComplete(
    config: AiGenerateConfig,
    systemPrompt: string,
    userPrompt: string,
    schema?: JsonSchema
  ): Promise<string>
  checkStatus(config: AiCheckConfig): Promise<AiProviderStatus>
  /** Cancels one streaming generation by the id it was started with. */
  cancel(requestId: string): Promise<void>
}

/**
 * Resolves a persisted, connection-only {@link AiConnectionConfig} plus a feature's chosen
 * `temperature` into the wire {@link AiGenerateConfig} the backend dispatches on.
 *
 * `maxTokens` is the other half of prompt sizing: every feature's prompt budget holds that many
 * tokens back for the answer, and sending the cap is what obliges the model to fit in the room it
 * was given. Before it, the reserve was a hope — a long answer ran past it and overflowed the window
 * the prompt had been sized against, losing the instruction at the *start*. It defaults to
 * {@link RESERVED_OUTPUT_TOKENS}, the same constant the budgets subtract, so the pairing is right
 * unless a feature deliberately says otherwise.
 */
export function resolveGenerateConfig(
  connection: AiConnectionConfig,
  temperature: number,
  maxTokens: number = RESERVED_OUTPUT_TOKENS
): AiGenerateConfig {
  const { protocol } = getAiPreset(connection.preset)
  return {
    protocol,
    url: connection.url,
    model: connection.model,
    apiKey: connection.apiKey,
    temperature,
    timeoutSeconds: connection.timeoutSeconds,
    maxTokens,
  }
}

/** A streaming feature exposed as a service. `run` accepts the connection settings and the feature
 * input, resolves everything the feature owns (instruction, temperature, prompt), and hands a fully
 * built request to the transport. Tokens are delivered via Tauri events the caller subscribes to
 * separately (see `useAiGeneration`). */
export interface StreamingFeatureService<Input> {
  /**
   * `requestId` is minted by whatever is listening for this generation's events — the host's
   * streaming hook — and threaded down rather than generated here, because the listener has to know
   * the id *before* the request starts. Generating it in this layer would leave the subscriber
   * unable to tell its own tokens from another feature's.
   */
  run(connection: AiConnectionConfig, input: Input, requestId: string): Promise<void>
  cancel(requestId: string): Promise<void>
}

/** A completion feature exposed as a service. `run` resolves the request, awaits the full response,
 * and returns the feature's typed, parsed output. */
export interface CompletionFeatureService<Input, Output> {
  run(connection: AiConnectionConfig, input: Input): Promise<Output>
}

export function createStreamingService<Input>(
  feature: StreamingFeature<Input>,
  transport: AiTransport
): StreamingFeatureService<Input> {
  return {
    run(connection, input, requestId) {
      const config = resolveGenerateConfig(
        connection,
        feature.temperature,
        feature.reservedOutputTokens?.(input)
      )
      return transport.runStream(config, feature.instruction, feature.buildPrompt(input), requestId)
    },
    cancel(requestId) {
      return transport.cancel(requestId)
    },
  }
}

export function createCompletionService<Input, Output>(
  feature: CompletionFeature<Input, Output>,
  transport: AiTransport
): CompletionFeatureService<Input, Output> {
  return {
    async run(connection, input) {
      const config = resolveGenerateConfig(
        connection,
        feature.temperature,
        feature.reservedOutputTokens?.(input)
      )
      const raw = await transport.runComplete(
        config,
        feature.instruction,
        feature.buildPrompt(input),
        feature.schema
      )
      return feature.parse(raw)
    },
  }
}

/** The probe's system message. Deliberately trivial and deterministic: the point is to prove the
 * round-trip, not to evaluate the model, so the cheapest possible completion is the right one. */
export const MODEL_PROBE_INSTRUCTION =
  'You are a connectivity probe. Reply with the single word OK. Do not explain, do not add punctuation.'

/** The probe's user turn. */
export const MODEL_PROBE_PROMPT = 'ping'

/** Upper bound (seconds) on how long a probe waits, regardless of the configured request timeout.
 * A "test this model" button that can hang for the user's 300s generation budget is not a test. */
export const MODEL_PROBE_MAX_TIMEOUT_SECONDS = 30

/**
 * Output cap for the probe, far below a feature's — the expected answer is the word "OK".
 *
 * Not premature tuning: the probe's failure mode is a *reasoning* model, which answers `ping` with
 * several hundred tokens of deliberation before the one word, on a button the user is watching. A
 * generation's 600-token cap would let that run to completion. Sixteen tokens is enough for any
 * honest answer to this prompt and turns a minute of thinking into a fast, still-correct pass —
 * `ok` only asks that the reply be non-empty, not that it be exactly "OK".
 */
export const MODEL_PROBE_MAX_OUTPUT_TOKENS = 16

/** Outcome of a {@link AiStatusService.probe} round-trip. */
export interface AiModelProbeResult {
  /** True when the model returned any non-empty text — that alone proves the whole path works. */
  ok: boolean
  /** The model's raw reply, trimmed. Empty when the probe failed. */
  reply: string
  /** Raw failure message from the transport (an app error payload the host can decode), unset on
   * success. Left undecoded here: this package has no host/IPC knowledge. */
  error?: string
  /** Round-trip duration in ms — also tells the user whether the model was cold. */
  durationMs: number
}

/** Connection checks — the AI operations that aren't features (no repo input, no prompt-building
 * over an `AiContext`), used by Settings to validate a provider before anything relies on it.
 *
 * Two levels, because they fail for different reasons and the distinction is what makes the page
 * diagnosable: `check` only asks the server which models it lists (`/v1/models`), while `probe`
 * actually sends the *selected* model a completion — the only way to catch a model that isn't
 * pulled, isn't served, or is rejected by an auth layer that let the model listing through. */
export interface AiStatusService {
  check(connection: AiConnectionConfig): Promise<AiProviderStatus>
  probe(connection: AiConnectionConfig): Promise<AiModelProbeResult>
}

export function createStatusService(transport: AiTransport): AiStatusService {
  return {
    check(connection) {
      const { protocol } = getAiPreset(connection.preset)
      return transport.checkStatus({ protocol, url: connection.url, apiKey: connection.apiKey })
    },

    async probe(connection) {
      // A probe is not a generation: it neither needs nor should be given a feature's answer budget.
      const config = resolveGenerateConfig(connection, 0, MODEL_PROBE_MAX_OUTPUT_TOKENS)
      config.timeoutSeconds = Math.min(config.timeoutSeconds, MODEL_PROBE_MAX_TIMEOUT_SECONDS)

      const startedAt = Date.now()
      try {
        const raw = await transport.runComplete(config, MODEL_PROBE_INSTRUCTION, MODEL_PROBE_PROMPT)
        const reply = raw.trim()
        return {
          // An empty body is a failure even on HTTP 200: some gateways answer the shape without
          // ever reaching a model, which would otherwise read as a green "it works".
          ok: reply.length > 0,
          reply,
          error: reply.length > 0 ? undefined : 'AI_EMPTY_RESPONSE',
          durationMs: Date.now() - startedAt,
        }
      } catch (error) {
        return {
          ok: false,
          reply: '',
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        }
      }
    },
  }
}
