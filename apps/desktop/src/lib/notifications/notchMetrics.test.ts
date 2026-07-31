import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiGetNotchMetrics = vi.hoisted(() => vi.fn())
vi.mock('../../api/notification.api', () => ({ apiGetNotchMetrics }))

import { resolveNotchMetrics, resetNotchMetricsCache } from './notchMetrics'

beforeEach(() => {
  apiGetNotchMetrics.mockReset()
  resetNotchMetricsCache()
})

describe('resolveNotchMetrics', () => {
  it('returns the metrics the native call reports', async () => {
    apiGetNotchMetrics.mockResolvedValue({ safeAreaTop: 38, housingHalfWidth: 110 })
    await expect(resolveNotchMetrics()).resolves.toEqual({
      safeAreaTop: 38,
      housingHalfWidth: 110,
    })
  })

  it('asks the native side exactly once across repeated calls', async () => {
    apiGetNotchMetrics.mockResolvedValue({ safeAreaTop: 38, housingHalfWidth: 110 })

    await resolveNotchMetrics()
    await resolveNotchMetrics()
    await resolveNotchMetrics()

    // A display cannot grow or lose its camera housing without the machine restarting — asking
    // again on every card would only add latency, never a different answer.
    expect(apiGetNotchMetrics).toHaveBeenCalledTimes(1)
  })

  it('caches the in-flight promise too, not just its resolved value', async () => {
    // Several cards can open before the first native call returns; none of them should trigger
    // their own.
    let resolveCall: (value: { safeAreaTop: number; housingHalfWidth: number }) => void = () => {}
    apiGetNotchMetrics.mockReturnValue(
      new Promise((resolve) => {
        resolveCall = resolve
      })
    )

    const first = resolveNotchMetrics()
    const second = resolveNotchMetrics()
    resolveCall({ safeAreaTop: 38, housingHalfWidth: 110 })

    expect(await first).toEqual(await second)
    expect(apiGetNotchMetrics).toHaveBeenCalledTimes(1)
  })

  it('caches a null answer too, rather than retrying forever', async () => {
    apiGetNotchMetrics.mockResolvedValue(null)

    await resolveNotchMetrics()
    await resolveNotchMetrics()

    expect(apiGetNotchMetrics).toHaveBeenCalledTimes(1)
  })
})

describe('resetNotchMetricsCache', () => {
  it('lets the next call ask again', async () => {
    apiGetNotchMetrics.mockResolvedValue({ safeAreaTop: 38, housingHalfWidth: 110 })
    await resolveNotchMetrics()

    resetNotchMetricsCache()
    await resolveNotchMetrics()

    expect(apiGetNotchMetrics).toHaveBeenCalledTimes(2)
  })
})
