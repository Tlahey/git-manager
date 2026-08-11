import { invoke } from '@tauri-apps/api/core'
import type { AiGenerateConfig } from '@git-manager/ai'

/**
 * Disk log of what the app actually said to the model, and what came back.
 *
 * The activity log cannot answer that. It records IPC *arguments* truncated to 200 characters and
 * never sees a return value, so for an AI call it can say one happened and how long it took, and
 * nothing about the thing you need — a prompt that came out wrong, or an answer that dropped half
 * the files. This records both, in full, in its own rotating file.
 *
 * Same two rules as `activityLogPersistence.ts`, for the same reasons:
 *  - it calls the RAW `invoke`, never the wrapped one in `lib/tauri.ts`, or writing the log would be
 *    logged and recurse;
 *  - failures are swallowed, because debugging output must never break the feature it observes.
 *
 * Batching is *not* copied over, though. Activity entries arrive in bursts of hundreds; AI calls
 * arrive seconds apart and are the thing most likely to precede a crash or a hang, so each one is
 * written as it completes rather than sat in a queue that a freeze would take with it.
 */

export interface AiTranscriptEntry {
  timestamp: number
  /** Which feature made the call — `file-summary`, `summary-grouping`, `file-grouping`, … */
  featureId: string
  model: string
  temperature: number
  maxTokens?: number
  durationMs: number
  status: 'ok' | 'error'
  systemPrompt: string
  userPrompt: string
  /**
   * The model's full answer.
   *
   * Absent for streaming features by nature, not by omission: their tokens arrive out of band as
   * Tauri events and the transport call resolves with nothing. Completion features — every
   * structured one, including the whole commit planner — record it.
   */
  response?: string
  error?: string
}

function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Writes one call's transcript. Never throws.
 *
 * `config` carries the provider's URL — the API key itself no longer travels on it at all, living in
 * the OS keychain and being attached in Rust — so the entry is built field by field from it rather
 * than spread. A spread would put whatever gets added to `AiGenerateConfig` next straight on disk.
 */
export function recordAiTranscript(entry: {
  featureId: string
  config: AiGenerateConfig
  systemPrompt: string
  userPrompt: string
  durationMs: number
  status: 'ok' | 'error'
  response?: string
  error?: string
}): void {
  if (!inTauri()) return

  const transcript: AiTranscriptEntry = {
    timestamp: Date.now(),
    featureId: entry.featureId,
    model: entry.config.model,
    temperature: entry.config.temperature,
    maxTokens: entry.config.maxTokens,
    durationMs: entry.durationMs,
    status: entry.status,
    systemPrompt: entry.systemPrompt,
    userPrompt: entry.userPrompt,
    response: entry.response,
    error: entry.error,
  }

  void invoke('append_ai_log', { entries: [transcript] }).catch(() => {
    // Best-effort: never surface to the user, never block the generation.
  })
}
