import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createElement } from 'react'
import { SWRConfig } from 'swr'

const fetchPrFilesViewedState = vi.fn()
const markPrFileAsViewed = vi.fn()
const unmarkPrFileAsViewed = vi.fn()
vi.mock('../api/github.api', () => ({
  fetchPrFilesViewedState: (...a: unknown[]) => fetchPrFilesViewedState(...a),
  markPrFileAsViewed: (...a: unknown[]) => markPrFileAsViewed(...a),
  unmarkPrFileAsViewed: (...a: unknown[]) => unmarkPrFileAsViewed(...a),
}))

const useRepoGitHub = vi.fn()
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub: () => useRepoGitHub() }))

import { usePrFilesViewedState } from './usePrFilesViewedState'

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children)

beforeEach(() => {
  fetchPrFilesViewedState.mockReset()
  markPrFileAsViewed.mockReset()
  unmarkPrFileAsViewed.mockReset()
  useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: 'tok' })
})

describe('usePrFilesViewedState', () => {
  it('skips fetching when signed out', () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: null })
    renderHook(() => usePrFilesViewedState('/repo', 5), { wrapper })
    expect(fetchPrFilesViewedState).not.toHaveBeenCalled()
  })

  it('fetches with owner/repo/number/token and exposes the PR node id + per-path state', async () => {
    fetchPrFilesViewedState.mockResolvedValue({
      pullRequestId: 'PR_kwABC',
      viewedByPath: { 'src/a.ts': 'VIEWED' },
    })
    const { result } = renderHook(() => usePrFilesViewedState('/repo', 5), { wrapper })
    await waitFor(() => expect(result.current.pullRequestId).toBe('PR_kwABC'))
    expect(fetchPrFilesViewedState).toHaveBeenCalledWith('org', 'repo', 5, 'tok')
    expect(result.current.viewedByPath).toEqual({ 'src/a.ts': 'VIEWED' })
  })

  it('defaults to null id and an empty map before data arrives', () => {
    fetchPrFilesViewedState.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePrFilesViewedState('/repo', 5), { wrapper })
    expect(result.current.pullRequestId).toBeNull()
    expect(result.current.viewedByPath).toEqual({})
    expect(result.current.isLoading).toBe(true)
  })
})

describe('usePrFilesViewedState — toggleViewed (optimistic)', () => {
  it('flips the cache to VIEWED immediately, before the mutation resolves, then settles', async () => {
    fetchPrFilesViewedState.mockResolvedValue({
      pullRequestId: 'PR_kwABC',
      viewedByPath: { 'a.ts': 'UNVIEWED' },
    })
    let resolveMark: () => void = () => {}
    markPrFileAsViewed.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMark = resolve
      })
    )

    const { result } = renderHook(() => usePrFilesViewedState('/repo', 5), { wrapper })
    await waitFor(() => expect(result.current.pullRequestId).toBe('PR_kwABC'))

    let togglePromise!: Promise<void>
    act(() => {
      togglePromise = result.current.toggleViewed('a.ts')
    })

    // Optimistic flip is visible before the network call settles.
    await waitFor(() => expect(result.current.viewedByPath['a.ts']).toBe('VIEWED'))
    expect(result.current.isToggling).toBe(true)
    expect(markPrFileAsViewed).toHaveBeenCalledWith('PR_kwABC', 'a.ts', 'tok')
    expect(unmarkPrFileAsViewed).not.toHaveBeenCalled()

    resolveMark()
    await act(async () => {
      await togglePromise
    })
    expect(result.current.isToggling).toBe(false)
    expect(result.current.viewedByPath['a.ts']).toBe('VIEWED')
  })

  it('unmarks an already-viewed file', async () => {
    fetchPrFilesViewedState.mockResolvedValue({
      pullRequestId: 'PR_kwABC',
      viewedByPath: { 'a.ts': 'VIEWED' },
    })
    unmarkPrFileAsViewed.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePrFilesViewedState('/repo', 5), { wrapper })
    await waitFor(() => expect(result.current.pullRequestId).toBe('PR_kwABC'))

    await act(async () => {
      await result.current.toggleViewed('a.ts')
    })
    expect(unmarkPrFileAsViewed).toHaveBeenCalledWith('PR_kwABC', 'a.ts', 'tok')
    expect(markPrFileAsViewed).not.toHaveBeenCalled()
    expect(result.current.viewedByPath['a.ts']).toBe('UNVIEWED')
  })

  it('rolls back the optimistic flip when the mutation fails', async () => {
    fetchPrFilesViewedState.mockResolvedValue({
      pullRequestId: 'PR_kwABC',
      viewedByPath: { 'a.ts': 'UNVIEWED' },
    })
    markPrFileAsViewed.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => usePrFilesViewedState('/repo', 5), { wrapper })
    await waitFor(() => expect(result.current.pullRequestId).toBe('PR_kwABC'))

    await act(async () => {
      await expect(result.current.toggleViewed('a.ts')).rejects.toThrow()
    })

    await waitFor(() => expect(result.current.viewedByPath['a.ts']).toBe('UNVIEWED'))
    expect(result.current.isToggling).toBe(false)
  })

  it('is a no-op before data has loaded', async () => {
    fetchPrFilesViewedState.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => usePrFilesViewedState('/repo', 5), { wrapper })
    await act(async () => {
      await result.current.toggleViewed('a.ts')
    })
    expect(markPrFileAsViewed).not.toHaveBeenCalled()
    expect(unmarkPrFileAsViewed).not.toHaveBeenCalled()
  })
})
