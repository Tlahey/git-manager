import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePendingPrOpen } from './usePendingPrOpen'
import { useLaunchpadStore } from '../stores/launchpad.store'
import type { MockPR } from '../../../lib/github/types'

function pr(id: string): MockPR {
  return {
    id,
    number: 42,
    title: 'feat: add thing',
    repo: 'git-manager',
    repoUrl: '',
    url: '',
    status: 'open',
    ciStatus: null,
    author: 'antoine',
    authorAvatar: '',
    collaborators: [],
    filesChanged: 1,
    additions: 1,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewStatus: 'pending',
    isDraft: false,
    labels: [],
    comments: 0,
  }
}

beforeEach(() => {
  useLaunchpadStore.setState({ pendingOpenPrId: null })
})

describe('usePendingPrOpen', () => {
  it('does nothing when no open was requested', () => {
    const onOpen = vi.fn()
    renderHook(() => usePendingPrOpen({ prs: [pr('pr-42')], loading: false, onOpen }))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('opens the requested PR and clears the request', () => {
    const onOpen = vi.fn()
    useLaunchpadStore.setState({ pendingOpenPrId: 'pr-42' })

    renderHook(() => usePendingPrOpen({ prs: [pr('pr-1'), pr('pr-42')], loading: false, onOpen }))

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'pr-42' }))
    expect(useLaunchpadStore.getState().pendingOpenPrId).toBeNull()
  })

  // The click routed here precisely because the list wasn't ready yet; don't declare the PR
  // missing while it is still arriving.
  it('waits while the list is still loading', () => {
    const onOpen = vi.fn()
    useLaunchpadStore.setState({ pendingOpenPrId: 'pr-42' })

    const { rerender } = renderHook(
      ({ loading }) => usePendingPrOpen({ prs: loading ? [] : [pr('pr-42')], loading, onOpen }),
      { initialProps: { loading: true } }
    )
    expect(onOpen).not.toHaveBeenCalled()
    expect(useLaunchpadStore.getState().pendingOpenPrId).toBe('pr-42')

    rerender({ loading: false })
    expect(onOpen).toHaveBeenCalledOnce()
  })

  // Otherwise a request nobody can satisfy sits there and fires at some unrelated later refresh.
  it('drops a request for a PR the loaded list does not contain', () => {
    const onOpen = vi.fn()
    useLaunchpadStore.setState({ pendingOpenPrId: 'pr-gone' })

    renderHook(() => usePendingPrOpen({ prs: [pr('pr-42')], loading: false, onOpen }))

    expect(onOpen).not.toHaveBeenCalled()
    expect(useLaunchpadStore.getState().pendingOpenPrId).toBeNull()
  })
})
