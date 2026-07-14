export { DEFAULT_SYSTEM_PROMPT, resolveSystemPrompt } from './prompts'
export { createAiService } from './service'
export type { AiService, AiTransport } from './service'

/** The actual wire format a Rust provider implementation speaks. Multiple presets (`AiPresetId`)
 * can share one protocol — e.g. Ollama, LM Studio, and OpenAI itself all speak
 * `openai-compatible` — so adding a new preset rarely means writing a new provider. */
export type AiProtocol = 'openai-compatible' | 'anthropic-messages'

/** The user-facing choice in Settings. Deliberately kept separate from `AiProtocol`: this is the
 * SOLID seam that lets several presets share one concrete backend implementation. */
export type AiPresetId = 'ollama' | 'lmstudio' | 'openai' | 'anthropic' | 'mlx'

export interface AiPresetDefinition {
  id: AiPresetId
  label: string
  protocol: AiProtocol
  defaultUrl: string
  requiresApiKey: boolean
  /** false = listed in the Settings dropdown but disabled ("coming soon") — the backend has no
   * working provider for this preset's protocol yet, or the preset itself isn't wired up. */
  implemented: boolean
}

export const AI_PRESETS: AiPresetDefinition[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    protocol: 'openai-compatible',
    defaultUrl: 'http://localhost:11434',
    requiresApiKey: false,
    implemented: true,
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    protocol: 'openai-compatible',
    defaultUrl: 'http://localhost:1234',
    requiresApiKey: false,
    implemented: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai-compatible',
    defaultUrl: 'https://api.openai.com',
    requiresApiKey: true,
    implemented: false,
  },
  {
    id: 'mlx',
    label: 'MLX',
    protocol: 'openai-compatible',
    defaultUrl: 'http://localhost:8080',
    requiresApiKey: false,
    implemented: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    protocol: 'anthropic-messages',
    defaultUrl: 'https://api.anthropic.com',
    requiresApiKey: true,
    implemented: false,
  },
]

export function getAiPreset(id: AiPresetId): AiPresetDefinition {
  const preset = AI_PRESETS.find((p) => p.id === id)
  if (!preset) throw new Error(`Unknown AI preset: ${id}`)
  return preset
}

/** Persisted shape of `AppSettings.ai` (replaces the old, Ollama-only `AppSettings.ollama`). */
export interface AiGenerationConfig {
  preset: AiPresetId
  url: string
  model: string
  apiKey?: string
  temperature: number
  timeoutSeconds: number
  systemPrompt: string
  includeRepoContext: boolean
  autoDetectScope: boolean
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

/** Wire shape for the `generate_commit_message` Tauri command's `config` argument — mirrors
 * `AiGenerationConfig` plus the resolved `protocol` the backend dispatches on. */
export interface AiGenerateConfig {
  protocol: AiProtocol
  url: string
  model: string
  apiKey?: string
  temperature: number
  timeoutSeconds: number
  systemPrompt?: string
  includeRepoContext: boolean
  autoDetectScope: boolean
}
