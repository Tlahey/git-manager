import type {
  AiCheckConfig,
  AiConnectionConfig,
  AiGenerateConfig,
  AiProviderStatus,
  JsonSchema,
} from './config'
import { getAiPreset } from './presets'
import { RESERVED_OUTPUT_TOKENS } from './promptSize'
import { newAiRequestId } from './requestId'

/**
 * Which of the configured models a feature's calls should go to.
 *
 * `'fast'` is for calls that are **many and undemanding** — today only the per-file summary, whose
 * job is to describe one file in two clauses and which runs once per changed file. It is not a
 * label for "repetitive": the commit search's per-commit verdict is just as repetitive and is
 * exactly where a weaker model invents matches, so it stays on the main model.
 *
 * Declared by the feature, beside its instruction and temperature, for the same reason those are:
 * the user configures a *connection*, not which model does which job — that is a property of the
 * work, and getting it wrong degrades output nobody can debug.
 */
export type AiFeatureTier = 'main' | 'fast'

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
  /** Which configured model this feature's calls go to. Defaults to `'main'`. */
  tier?: AiFeatureTier
  /**
   * Overrides the connection's timeout for this feature's calls. `0` means no
   * timeout at all (the backend treats a zero budget as unbounded).
   *
   * The connection's setting is tuned for the interactive features — a commit
   * message that has not started in 60s is a broken provider. A feature that reads
   * a large document and returns one structured verdict is a different shape of
   * work: it can legitimately think for minutes on a local model, and killing it at
   * the interactive budget turns a slow answer into no answer. Set this only when
   * the feature is genuinely long-running, and say why at the call site.
   */
  timeoutSeconds?: number
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
  StreamingFeature<Input> | CompletionFeature<Input, Output>

/** The low-level operations a feature service needs from its host. The app provides a Tauri-backed
 * implementation (from `api/ai.api.ts`), keeping this package free of any `@tauri-apps/api`
 * dependency and respecting the repo invariant that `invoke()` only lives in the api layer.
 *
 * `runStream` starts a streaming generation whose tokens are delivered out-of-band, via events the
 * caller listens to; the promise itself resolves when the generation *finishes* (or rejects if it
 * fails), not when the request is accepted — so awaiting it is a valid way to know the model is
 * done, which is what the app's footer activity indicator relies on. `runComplete` resolves with the
 * full response text. Neither knows anything about *which* feature it serves.
 *
 * **Both take a request id, and for the same reason: it is what {@link cancel} names.** It used to
 * be the stream's alone, because a stream has events to stop emitting and a completion has nothing
 * visible to stop — which mistook what the user is waiting for. The request is what costs their
 * time, and the features that map over files or commits are made of hundreds of completions. */
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
    schema: JsonSchema | undefined,
    requestId: string
  ): Promise<string>
  checkStatus(config: AiCheckConfig): Promise<AiProviderStatus>
  /** Cancels one call — streaming or completion — by the id it was started with. */
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
  maxTokens: number = RESERVED_OUTPUT_TOKENS,
  tier: AiFeatureTier = 'main',
  /** A feature's own budget, when it declares one. See `BaseFeature.timeoutSeconds`. */
  timeoutSeconds?: number
): AiGenerateConfig {
  const { protocol } = getAiPreset(connection.preset)
  return {
    protocol,
    url: connection.url,
    // The fast lane is a model swap and nothing else — same URL, same credential — so an unset or
    // blank second model silently means "everything on the main one", which is the default setup.
    model:
      tier === 'fast' && connection.fastModel?.trim() ? connection.fastModel : connection.model,
    temperature,
    // `?? ` not `||`: a feature's 0 means "no timeout" and must not fall back.
    timeoutSeconds: timeoutSeconds ?? connection.timeoutSeconds,
    maxTokens,
    // Passed through untouched, and only when there is something to pass: an empty object on every
    // request would be a change to the wire format for no reason.
    ...(connection.extraBody && Object.keys(connection.extraBody).length > 0
      ? { extraBody: connection.extraBody }
      : {}),
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
  /**
   * `requestId` is **optional here, unlike on the streaming service, and the difference is not an
   * oversight.** A stream's caller has to mint the id because it is listening for events before the
   * request starts, and a listener that does not know its own id cannot tell its tokens from another
   * feature's. A completion answers on the promise itself, so nothing outside needs a name for it —
   * except a caller that intends to *stop* it, which cannot cancel what it did not name. So: minted
   * here when the caller has no use for it, supplied by the caller when it is running many calls and
   * tracking which are still open (see `AiCallTracker`).
   *
   * One id per call either way. The backend's registry replaces an entry on re-registration and
   * removes it on completion, so two concurrent calls sharing an id leaves one of them uncancellable
   * and lets the first to finish unregister the other's flag.
   */
  run(connection: AiConnectionConfig, input: Input, requestId?: string): Promise<Output>
  /** Stops one call started by {@link run}, named by the id it was given. */
  cancel(requestId: string): Promise<void>
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
        feature.reservedOutputTokens?.(input),
        feature.tier,
        feature.timeoutSeconds
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
    async run(connection, input, requestId) {
      const config = resolveGenerateConfig(
        connection,
        feature.temperature,
        feature.reservedOutputTokens?.(input),
        feature.tier,
        feature.timeoutSeconds
      )
      const raw = await transport.runComplete(
        config,
        feature.instruction,
        feature.buildPrompt(input),
        feature.schema,
        requestId ?? newAiRequestId()
      )
      return feature.parse(raw)
    },
    cancel(requestId) {
      return transport.cancel(requestId)
    },
  }
}

/**
 * The probe's system message. Deliberately trivial and deterministic: the point is to prove the
 * round-trip, not to evaluate the model, so the cheapest possible completion is the right one.
 *
 * It asks for **JSON** rather than the word "OK" because the round-trip is only half of what a user
 * needs to know before relying on this model. Half the features constrain their answer with a JSON
 * schema, and a model that ignores that constraint does not degrade them — it fails every one of
 * their calls. That is invisible until a feature runs, which for the commit search means half an
 * hour of scanning that returns nothing readable. One probe now answers both questions.
 */
export const MODEL_PROBE_INSTRUCTION =
  'You are a connectivity probe. Reply with exactly this JSON object and nothing else: {"ok": true}. No prose, no explanation, no code fences.'

/** The probe's user turn. */
export const MODEL_PROBE_PROMPT = 'ping'

/** The shape the probe asks for, so the reply proves the provider honors `response_format`. */
export const MODEL_PROBE_SCHEMA: JsonSchema = {
  name: 'model_probe',
  schema: {
    type: 'object',
    properties: { ok: { type: 'boolean', description: 'Always true.' } },
    required: ['ok'],
    additionalProperties: false,
  },
  strict: true,
}

/** Upper bound (seconds) on how long a probe waits, regardless of the configured request timeout.
 * A "test this model" button that can hang for the user's 300s generation budget is not a test. */
export const MODEL_PROBE_MAX_TIMEOUT_SECONDS = 30

/**
 * Output cap for the probe, far below a feature's — the expected answer is `{"ok": true}`.
 *
 * Not premature tuning: the probe's failure mode is a *reasoning* model, which answers `ping` with
 * several hundred tokens of deliberation before the object, on a button the user is watching. A
 * generation's 600-token cap would let that run to completion. This turns a minute of thinking into
 * a fast, still-correct pass — `ok` only asks that the reply be non-empty.
 *
 * Thirty-two rather than the original sixteen: the answer went from one word to a small object, and
 * a provider that prefixes a fence or a newline needs the room. Still far too little for a model to
 * think out loud in.
 */
export const MODEL_PROBE_MAX_OUTPUT_TOKENS = 32

/** Outcome of a {@link AiStatusService.probe} round-trip. */
export interface AiModelProbeResult {
  /** True when the model returned any non-empty text — that alone proves the whole path works. */
  ok: boolean
  /**
   * True when the reply came back as the JSON object the probe's schema asked for.
   *
   * Separate from {@link ok} because they fail independently and mean different things: a model can
   * be perfectly reachable and still ignore `response_format`, in which case every schema-driven
   * feature (commit message, commit plan, per-file summaries, the history search's per-commit
   * verdicts) fails on every call. `false` with `ok: true` is the state worth warning about — the
   * setup looks healthy and half the app does not work.
   */
  structured: boolean
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
  /**
   * Sends one tiny schema-constrained completion to a model.
   *
   * `model` overrides the connection's own — that is what lets Settings test the **fast** model
   * (see {@link AiConnectionConfig.fastModel}) through the same path, rather than leaving the second
   * slot as the one field nobody can validate.
   */
  probe(connection: AiConnectionConfig, model?: string): Promise<AiModelProbeResult>
}

/** Whether a probe reply is the object the schema asked for. Tolerates a fence or surrounding prose
 * the same way every feature's parser does — the question is "did a JSON object come back", not
 * "was the provider byte-perfect". */
export function isStructuredProbeReply(reply: string): boolean {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start === -1 || end <= start) return false
  try {
    const parsed: unknown = JSON.parse(reply.slice(start, end + 1))
    return typeof parsed === 'object' && parsed !== null && 'ok' in parsed
  } catch {
    return false
  }
}

export function createStatusService(transport: AiTransport): AiStatusService {
  return {
    check(connection) {
      const { protocol } = getAiPreset(connection.preset)
      // No key travels with this: the backend reads it from the OS keychain.
      return transport.checkStatus({ protocol, url: connection.url })
    },

    async probe(connection, model) {
      // A probe is not a generation: it neither needs nor should be given a feature's answer budget.
      const config = resolveGenerateConfig(connection, 0, MODEL_PROBE_MAX_OUTPUT_TOKENS)
      config.timeoutSeconds = Math.min(config.timeoutSeconds, MODEL_PROBE_MAX_TIMEOUT_SECONDS)
      if (model) config.model = model

      const startedAt = Date.now()
      try {
        const raw = await transport.runComplete(
          config,
          MODEL_PROBE_INSTRUCTION,
          MODEL_PROBE_PROMPT,
          MODEL_PROBE_SCHEMA,
          // Minted and dropped: the probe has no cancel button — it is capped at 32 output tokens
          // and 30 seconds — but the backend keys its registry by id, so every call needs one of its
          // own or two probes at once would share an entry.
          newAiRequestId()
        )
        const reply = raw.trim()
        return {
          // An empty body is a failure even on HTTP 200: some gateways answer the shape without
          // ever reaching a model, which would otherwise read as a green "it works".
          ok: reply.length > 0,
          // Asked for in the same round trip rather than a second one: the two questions share a
          // prompt, and a probe the user is watching should not cost two model loads.
          structured: isStructuredProbeReply(reply),
          reply,
          error: reply.length > 0 ? undefined : 'AI_EMPTY_RESPONSE',
          durationMs: Date.now() - startedAt,
        }
      } catch (error) {
        return {
          ok: false,
          structured: false,
          reply: '',
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
        }
      }
    },
  }
}
