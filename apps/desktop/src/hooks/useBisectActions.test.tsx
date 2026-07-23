import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { BisectState } from '@git-manager/git-types'

const apiBisectMark = vi.fn()
const apiBisectReset = vi.fn()
const apiBisectStart = vi.fn()
const apiStashPush = vi.fn()
const apiStashPop = vi.fn()
const swrMutate = vi.fn()
const toastError = vi.fn()
const toastSuccess = vi.fn()

vi.mock('../api/git.api', () => ({
  apiBisectMark: (...a: unknown[]) => apiBisectMark(...a),
  apiBisectReset: (...a: unknown[]) => apiBisectReset(...a),
  apiBisectStart: (...a: unknown[]) => apiBisectStart(...a),
  apiStashPush: (...a: unknown[]) => apiStashPush(...a),
  apiStashPop: (...a: unknown[]) => apiStashPop(...a),
}))
vi.mock('swr', () => ({ mutate: (...a: unknown[]) => swrMutate(...a) }))
vi.mock('@git-manager/ui', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}))

import { useBisectActions } from './useBisectActions'
import { useBisectUIStore } from '../stores/bisectUI.store'

const resolvedState: BisectState = {
  active: true,
  badTerm: 'bad',
  goodTerm: 'good',
  goodOids: [],
  skippedOids: [],
  firstBadOid: 'culprit',
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useBisectActions', () => {
  beforeEach(() => {
    apiBisectMark.mockReset()
    apiBisectReset.mockReset()
    apiBisectStart.mockReset()
    apiStashPush.mockReset().mockResolvedValue(undefined)
    apiStashPop.mockReset().mockResolvedValue(undefined)
    swrMutate.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
    useBisectUIStore.setState({ autoStashed: false })
  })

  it('starts a bisect with the picked bad/good revisions and seeds the cache', async () => {
    const active = { ...resolvedState, firstBadOid: undefined }
    apiBisectStart.mockResolvedValue(active)
    const { result } = renderHook(() => useBisectActions('/repo'), { wrapper })

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.start('bad-sha', 'good-sha')
    })

    expect(ok).toBe(true)
    expect(apiBisectStart).toHaveBeenCalledWith('/repo', 'bad-sha', 'good-sha')
    expect(swrMutate).toHaveBeenCalledWith(['bisect-state', '/repo'], active, { revalidate: false })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('returns false and toasts when the start fails (e.g. a dirty worktree)', async () => {
    apiBisectStart.mockRejectedValue(new Error('local changes would be overwritten'))
    const { result } = renderHook(() => useBisectActions('/repo'), { wrapper })

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.start('bad-sha', 'good-sha')
    })

    expect(ok).toBe(false)
    expect(toastError).toHaveBeenCalled()
  })

  it('marks a term, updates the SWR cache and toasts when the culprit is found', async () => {
    apiBisectMark.mockResolvedValue(resolvedState)
    const { result } = renderHook(() => useBisectActions('/repo'), { wrapper })

    await act(async () => {
      await result.current.mark('bad')
    })

    expect(apiBisectMark).toHaveBeenCalledWith('/repo', 'bad')
    expect(swrMutate).toHaveBeenCalledWith(['bisect-state', '/repo'], resolvedState, {
      revalidate: false,
    })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('surfaces errors as a toast', async () => {
    apiBisectMark.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useBisectActions('/repo'), { wrapper })

    await act(async () => {
      await result.current.mark('good')
    })

    await waitFor(() => expect(toastError).toHaveBeenCalled())
  })

  it('resets the session', async () => {
    apiBisectReset.mockResolvedValue({ ...resolvedState, active: false, firstBadOid: undefined })
    const { result } = renderHook(() => useBisectActions('/repo'), { wrapper })

    await act(async () => {
      await result.current.reset()
    })

    expect(apiBisectReset).toHaveBeenCalledWith('/repo')
    expect(swrMutate).toHaveBeenCalled()
  })

  it('auto-restores the stash after reset when the session was auto-stashed', async () => {
    useBisectUIStore.setState({ autoStashed: true })
    apiBisectReset.mockResolvedValue({ ...resolvedState, active: false })
    const { result } = renderHook(() => useBisectActions('/repo'), { wrapper })

    await act(async () => {
      await result.current.reset()
    })

    expect(apiBisectReset).toHaveBeenCalledWith('/repo')
    // The stash is popped back automatically (no prompt) and the flag is cleared.
    expect(apiStashPop).toHaveBeenCalledWith('/repo')
    expect(useBisectUIStore.getState().autoStashed).toBe(false)
  })

  it('does not pop a stash after reset when nothing was auto-stashed', async () => {
    apiBisectReset.mockResolvedValue({ ...resolvedState, active: false })
    const { result } = renderHook(() => useBisectActions('/repo'), { wrapper })

    await act(async () => {
      await result.current.reset()
    })

    expect(apiStashPop).not.toHaveBeenCalled()
  })

  it('stashes up front and flags the session as auto-stashed (no start yet)', async () => {
    const { result } = renderHook(() => useBisectActions('/repo'), { wrapper })

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.stashForBisect()
    })

    expect(ok).toBe(true)
    expect(apiStashPush).toHaveBeenCalledWith('/repo', 'git-manager: bisect autostash', true)
    // Stashing precedes the commit selection, so no bisect is started here.
    expect(apiBisectStart).not.toHaveBeenCalled()
    expect(useBisectUIStore.getState().autoStashed).toBe(true)
  })

  it('returns false and does not flag when the up-front stash fails', async () => {
    apiStashPush.mockRejectedValue(new Error('nothing to stash'))
    const { result } = renderHook(() => useBisectActions('/repo'), { wrapper })

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.stashForBisect()
    })

    expect(ok).toBe(false)
    expect(toastError).toHaveBeenCalled()
    expect(useBisectUIStore.getState().autoStashed).toBe(false)
  })

  it('restores the auto-stash by popping it', async () => {
    useBisectUIStore.setState({ autoStashed: true })
    const { result } = renderHook(() => useBisectActions('/repo'), { wrapper })

    await act(async () => {
      await result.current.restoreStash()
    })

    expect(apiStashPop).toHaveBeenCalledWith('/repo')
    expect(useBisectUIStore.getState().autoStashed).toBe(false)
  })
})
