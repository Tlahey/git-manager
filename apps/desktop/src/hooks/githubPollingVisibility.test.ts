import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import useSWR, { SWRConfig } from 'swr'
import { createElement, type ReactNode } from 'react'

/**
 * The one behaviour that keeps a minimised window from spending an hour's GitHub quota on nothing.
 *
 * Nothing in this repository implements it: SWR's `refreshWhenHidden` defaults to `false`, and its
 * `isVisible` reads `document.visibilityState` (not focus, which would wrongly stop polling for a
 * window sitting visible beside the editor). Every GitHub poller therefore already skips its fetch
 * while the window is hidden, and re-adding a visibility gate on top would be dead code.
 *
 * It is asserted here rather than assumed because it is a *library default* the app leans on: an SWR
 * upgrade that flipped it, or a global `SWRConfig` that set `refreshWhenHidden: true`, would restore
 * the old behaviour silently — a window nobody is looking at, polling GitHub every minute, for as
 * long as the app is running.
 */

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Isolates the cache, so the polling under test is not deduped against another test's key. */
function wrapper({ children }: { children: ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map() } }, children)
}

describe('GitHub polling while the window is hidden', () => {
  it('stops fetching once the window is hidden, and resumes when it comes back', async () => {
    const fetcher = vi.fn(async () => 'data')
    // `dedupingInterval: 0` so the polling under test is not swallowed by SWR's two-second dedupe —
    // the real hooks poll every twenty seconds or more, far outside it.
    renderHook(() => useSWR('poller', fetcher, { refreshInterval: 20, dedupingInterval: 0 }), {
      wrapper,
    })

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(1))

    visibility = 'hidden'
    const whenHidden = fetcher.mock.calls.length
    await new Promise((r) => setTimeout(r, 120))
    expect(fetcher).toHaveBeenCalledTimes(whenHidden)

    visibility = 'visible'
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(whenHidden))
  })
})
