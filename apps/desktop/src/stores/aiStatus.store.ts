import { create } from 'zustand'
import type { AiConnectionConfig, AiProviderStatus } from '@git-manager/ai'
import { aiStatusService } from '../api/ai.api'

/** Liveness of the configured AI provider, shared by every surface that reports it: the startup
 * check, the warning banner, the footer indicator and the Settings page's validate button. */
export type AiConnectionState = 'unknown' | 'checking' | 'connected' | 'disconnected'

interface AiStatusState {
  state: AiConnectionState
  /** Model ids advertised by the provider's `/v1/models`, empty until a check succeeds. */
  models: string[]
  /** Epoch ms of the last completed check, `null` until one has run. */
  lastCheckedAt: number | null
  /** Why the last check failed, as reported by the provider transport (probed URL + HTTP status).
   * `null` while connected or before anything ran. */
  detail: string | null
  /** Runs a connection check and stores the outcome. Rejections are swallowed into a
   * `disconnected` state — an unreachable provider is an expected condition here, not an error. */
  check: (connection: AiConnectionConfig) => Promise<AiProviderStatus>
  /** Back to square one — used when AI gets disabled, so no stale banner survives the toggle. */
  reset: () => void
}

const DISCONNECTED: AiProviderStatus = { connected: false, models: [] }

/** Guards against an earlier, slower check overwriting a newer one's result (the user hammering the
 * validate button while a 5s timeout is still pending on the previous URL). */
let latestRequestId = 0

export const useAiStatusStore = create<AiStatusState>((set) => ({
  state: 'unknown',
  models: [],
  lastCheckedAt: null,
  detail: null,

  check: async (connection) => {
    const requestId = ++latestRequestId
    set({ state: 'checking' })

    let status: AiProviderStatus
    try {
      status = await aiStatusService.check(connection)
    } catch (error) {
      // The command itself blew up (rather than reporting an unreachable provider) — keep its
      // message as the detail, it's the only clue the user gets in that path.
      status = { ...DISCONNECTED, detail: error instanceof Error ? error.message : String(error) }
    }

    if (requestId === latestRequestId) {
      set({
        state: status.connected ? 'connected' : 'disconnected',
        models: status.models,
        detail: status.detail ?? null,
        lastCheckedAt: Date.now(),
      })
    }
    return status
  },

  reset: () => {
    // Bump the id so an in-flight check can no longer land after the reset.
    latestRequestId++
    set({ state: 'unknown', models: [], detail: null, lastCheckedAt: null })
  },
}))
