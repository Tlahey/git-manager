import type {
  AiCheckConfig,
  AiConnectionConfig,
  AiGenerateConfig,
  AiProviderStatus,
  JsonSchema,
} from './config'
import { getAiPreset } from './presets'

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
 * `runStream` kicks off a streaming generation and resolves once the request is *accepted* — the
 * tokens themselves are delivered out-of-band via Tauri events the caller listens to. `runComplete`
 * resolves with the full response text. Neither knows anything about *which* feature it serves. */
export interface AiTransport {
  runStream(config: AiGenerateConfig, systemPrompt: string, userPrompt: string): Promise<void>
  runComplete(
    config: AiGenerateConfig,
    systemPrompt: string,
    userPrompt: string,
    schema?: JsonSchema
  ): Promise<string>
  checkStatus(config: AiCheckConfig): Promise<AiProviderStatus>
  cancel(): Promise<void>
}

/** Resolves a persisted, connection-only {@link AiConnectionConfig} plus a feature's chosen
 * `temperature` into the wire {@link AiGenerateConfig} the backend dispatches on. */
export function resolveGenerateConfig(
  connection: AiConnectionConfig,
  temperature: number
): AiGenerateConfig {
  const { protocol } = getAiPreset(connection.preset)
  return {
    protocol,
    url: connection.url,
    model: connection.model,
    apiKey: connection.apiKey,
    temperature,
    timeoutSeconds: connection.timeoutSeconds,
  }
}

/** A streaming feature exposed as a service. `run` accepts the connection settings and the feature
 * input, resolves everything the feature owns (instruction, temperature, prompt), and hands a fully
 * built request to the transport. Tokens are delivered via Tauri events the caller subscribes to
 * separately (see `useAiGeneration`). */
export interface StreamingFeatureService<Input> {
  run(connection: AiConnectionConfig, input: Input): Promise<void>
  cancel(): Promise<void>
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
    run(connection, input) {
      const config = resolveGenerateConfig(connection, feature.temperature)
      return transport.runStream(config, feature.instruction, feature.buildPrompt(input))
    },
    cancel() {
      return transport.cancel()
    },
  }
}

export function createCompletionService<Input, Output>(
  feature: CompletionFeature<Input, Output>,
  transport: AiTransport
): CompletionFeatureService<Input, Output> {
  return {
    async run(connection, input) {
      const config = resolveGenerateConfig(connection, feature.temperature)
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

/** Connection health check — the one AI operation that isn't a feature (no instruction/prompt),
 * used by Settings to validate a provider and list its models. */
export interface AiStatusService {
  check(connection: AiConnectionConfig): Promise<AiProviderStatus>
}

export function createStatusService(transport: AiTransport): AiStatusService {
  return {
    check(connection) {
      const { protocol } = getAiPreset(connection.preset)
      return transport.checkStatus({ protocol, url: connection.url, apiKey: connection.apiKey })
    },
  }
}
