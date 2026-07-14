import type {
  AiCheckConfig,
  AiGenerateConfig,
  AiGenerationConfig,
  AiProviderStatus,
} from './index'
import { getAiPreset } from './index'
import { resolveSystemPrompt } from './prompts'

/** The low-level operations the AI service needs from its host. The app provides a Tauri-backed
 * implementation (from `api/ai.api.ts`), which keeps this package free of any `@tauri-apps/api`
 * dependency and respects the repo invariant that `invoke()` only lives in the api layer. */
export interface AiTransport {
  generateCommitMessage(path: string, config: AiGenerateConfig): Promise<void>
  checkStatus(config: AiCheckConfig): Promise<AiProviderStatus>
  cancelGeneration(): Promise<void>
}

/** The single service exposing every AI feature. It owns the business logic — resolving the
 * preset's wire protocol and applying the default instruction — then delegates the actual call to
 * the injected {@link AiTransport}. Components/hooks talk to this instead of assembling the wire
 * config inline. */
export interface AiService {
  generateCommitMessage(path: string, settings: AiGenerationConfig): Promise<void>
  checkStatus(settings: AiGenerationConfig): Promise<AiProviderStatus>
  cancelGeneration(): Promise<void>
}

/** Turns the persisted `AiGenerationConfig` (preset + user settings) into the wire config a
 * provider expects: resolves the protocol from the preset and fills the effective system prompt. */
function toGenerateConfig(settings: AiGenerationConfig): AiGenerateConfig {
  const { protocol } = getAiPreset(settings.preset)
  return {
    protocol,
    url: settings.url,
    model: settings.model,
    apiKey: settings.apiKey,
    temperature: settings.temperature,
    timeoutSeconds: settings.timeoutSeconds,
    systemPrompt: resolveSystemPrompt(settings.systemPrompt),
    includeRepoContext: settings.includeRepoContext,
    autoDetectScope: settings.autoDetectScope,
  }
}

export function createAiService(transport: AiTransport): AiService {
  return {
    generateCommitMessage(path, settings) {
      return transport.generateCommitMessage(path, toGenerateConfig(settings))
    },
    checkStatus(settings) {
      const { protocol } = getAiPreset(settings.preset)
      return transport.checkStatus({ protocol, url: settings.url, apiKey: settings.apiKey })
    },
    cancelGeneration() {
      return transport.cancelGeneration()
    },
  }
}
