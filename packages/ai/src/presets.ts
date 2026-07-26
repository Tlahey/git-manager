/** The actual wire format a Rust provider implementation speaks. Multiple presets (`AiPresetId`)
 * can share one protocol — both shipped presets speak `openai-compatible` — so adding a new preset
 * rarely means writing a new provider. `anthropic-messages` has a Rust implementation
 * (`ai_anthropic.rs`) but no preset points at it yet; it stays here as the seam that proves the
 * protocol/preset split is real. */
export type AiProtocol = 'openai-compatible' | 'anthropic-messages'

/** The user-facing choice in Settings. Deliberately kept separate from `AiProtocol`: this is the
 * SOLID seam that lets several presets share one concrete backend implementation.
 *
 * Only two entries by design. `ollama` is the zero-config local default; `openai-compatible` is the
 * generic escape hatch the user points anywhere — it replaced the previous per-vendor presets
 * (LM Studio, MLX, OpenAI), which were nothing but a different `defaultUrl` on the same protocol. */
export type AiPresetId = 'ollama' | 'openai-compatible'

export interface AiPresetDefinition {
  id: AiPresetId
  label: string
  protocol: AiProtocol
  defaultUrl: string
  /** An API key field is offered for this preset. Ollama is a local server with no auth; the
   * generic entry may point at a hosted API that wants a bearer token (the key stays optional —
   * an LM Studio or vLLM instance behind the same protocol needs none). */
  supportsApiKey: boolean
  /** i18n key (namespace `settings`) for the one-line hint shown under the provider picker. */
  descriptionKey: string
}

export const AI_PRESETS: AiPresetDefinition[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    protocol: 'openai-compatible',
    defaultUrl: 'http://localhost:11434',
    supportsApiKey: false,
    descriptionKey: 'settings.ai.presetHint.ollama',
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    protocol: 'openai-compatible',
    // Carries the `/v1` explicitly: for the generic entry the field is the *API base* (what an
    // OpenAI SDK would be handed), and showing the version segment is the clearest way to say so.
    defaultUrl: 'http://localhost:1234/v1',
    supportsApiKey: true,
    descriptionKey: 'settings.ai.presetHint.openaiCompatible',
  },
]

/** Maps a persisted preset id onto a currently-known one. The removed vendor presets (`lmstudio`,
 * `openai`, `mlx`, `anthropic`) fold into `openai-compatible` — they only ever differed by their
 * default URL, which is persisted separately and therefore preserved. Anything else unrecognized
 * (a hand-edited settings file) lands there too rather than throwing out of {@link getAiPreset}. */
export function migrateAiPresetId(id: string): AiPresetId {
  return AI_PRESETS.some((preset) => preset.id === id) ? (id as AiPresetId) : 'openai-compatible'
}

export function getAiPreset(id: AiPresetId): AiPresetDefinition {
  const preset = AI_PRESETS.find((p) => p.id === id)
  if (!preset) throw new Error(`Unknown AI preset: ${id}`)
  return preset
}
