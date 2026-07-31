/**
 * The real per-machine notch geometry, fetched once and cached for the process.
 *
 * It cannot meaningfully change while the app runs — a display cannot grow or lose its camera
 * housing without the machine restarting — so there is nothing to gain from a fresh native call
 * every time a card opens, only latency added to it.
 */

import { apiGetNotchMetrics } from '../../api/notification.api'
import type { NotchMetrics } from '../tauri'

let cached: Promise<NotchMetrics | null> | null = null

/** The real per-machine notch geometry, or `null` where there is nothing to go on (`apiGetNotchMetrics`
 *  already folds a failed call into that same answer). */
export function resolveNotchMetrics(): Promise<NotchMetrics | null> {
  cached ??= apiGetNotchMetrics()
  return cached
}

/** Test seam — drops the cached value, so a test isn't stuck with whatever the first one resolved. */
export function resetNotchMetricsCache(): void {
  cached = null
}
