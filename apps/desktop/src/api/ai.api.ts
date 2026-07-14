import type { AiCheckConfig, AiGenerateConfig, AiTransport } from '@git-manager/ai'
import { createAiService } from '@git-manager/ai'
import { checkAiStatus, generateCommitMessage, cancelGeneration } from '../lib/tauri'

export async function apiCheckAiStatus(config: AiCheckConfig) {
  return checkAiStatus(config)
}

export async function apiGenerateCommitMessage(path: string, config: AiGenerateConfig) {
  return generateCommitMessage(path, config)
}

export async function apiCancelGeneration() {
  return cancelGeneration()
}

/** Tauri-backed transport for `@git-manager/ai`'s service — the invoke wrappers above are the
 * only place IPC touches AI, keeping the package Tauri-agnostic. */
const tauriAiTransport: AiTransport = {
  generateCommitMessage: apiGenerateCommitMessage,
  checkStatus: apiCheckAiStatus,
  cancelGeneration: apiCancelGeneration,
}

/** The single entry point components/hooks use for AI features. It owns instruction/config
 * resolution (default system prompt, preset→protocol) and delegates the call to Tauri. */
export const aiService = createAiService(tauriAiTransport)
