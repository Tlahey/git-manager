import type { AiCheckConfig, AiGenerateConfig } from '@git-manager/ai'
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
