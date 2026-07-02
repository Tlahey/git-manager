import { checkOllamaStatus, generateCommitMessage, cancelGeneration } from '../lib/tauri'

export async function apiCheckOllamaStatus(url: string) {
  return checkOllamaStatus(url)
}

export async function apiGenerateCommitMessage(path: string, model: string, promptHint?: string) {
  return generateCommitMessage(path, model, promptHint)
}

export async function apiCancelGeneration() {
  return cancelGeneration()
}
