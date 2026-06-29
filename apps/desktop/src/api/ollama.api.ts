import { checkOllamaStatus } from '../lib/tauri'

export async function apiCheckOllamaStatus(url: string) {
  return checkOllamaStatus(url)
}
