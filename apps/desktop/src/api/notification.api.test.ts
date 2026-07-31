import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({ sendNativeNotification: vi.fn(), getNotchMetrics: vi.fn() }))

const listen = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/event', () => ({ listen: (...a: unknown[]) => listen(...a) }))

import * as tauri from '../lib/tauri'
import {
  apiSendNativeNotification,
  apiOnNotificationActivated,
  apiGetNotchMetrics,
} from './notification.api'

const sendNativeNotification = tauri.sendNativeNotification as unknown as ReturnType<typeof vi.fn>
const getNotchMetrics = tauri.getNotchMetrics as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('apiSendNativeNotification', () => {
  it('forwards the display payload and the route', async () => {
    sendNativeNotification.mockResolvedValue(undefined)
    const spec = { title: 'T', body: 'B', route: { kind: 'rewards' } } as const

    await apiSendNativeNotification(spec)

    expect(sendNativeNotification).toHaveBeenCalledWith(spec)
  })

  // A notification is an aside — no Tauri host (tests, browser dev) or an OS refusal must not take
  // down the action that raised it.
  it('swallows a rejection from the native side', async () => {
    sendNativeNotification.mockRejectedValue(new Error('no tauri host'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(
      apiSendNativeNotification({ title: 'T', body: 'B', route: { kind: 'rewards' } })
    ).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('apiOnNotificationActivated', () => {
  it('subscribes to the activation event and hands the route to the caller', async () => {
    const unlisten = vi.fn()
    listen.mockResolvedValue(unlisten)
    const handler = vi.fn()

    const returned = await apiOnNotificationActivated(handler)
    expect(listen).toHaveBeenCalledWith('notification://activated', expect.any(Function))
    expect(returned).toBe(unlisten)

    const route = { kind: 'rewards' }
    listen.mock.calls[0][1]({ payload: route })
    expect(handler).toHaveBeenCalledWith(route)
  })
})

describe('apiGetNotchMetrics', () => {
  it('forwards the real per-machine geometry', async () => {
    const metrics = { safeAreaTop: 38, housingHalfWidth: 110 }
    getNotchMetrics.mockResolvedValue(metrics)

    await expect(apiGetNotchMetrics()).resolves.toEqual(metrics)
  })

  it('reports null as-is — a display with no camera housing, not a failure', async () => {
    getNotchMetrics.mockResolvedValue(null)
    await expect(apiGetNotchMetrics()).resolves.toBeNull()
  })

  // A geometry read is decoration, not a gate: no Tauri host (tests, browser dev) or an OS
  // refusal must not take down whatever asked for the notch's layout.
  it('swallows a rejection and falls back to null', async () => {
    getNotchMetrics.mockRejectedValue(new Error('no tauri host'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(apiGetNotchMetrics()).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })
})
