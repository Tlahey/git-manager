import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'

const { markCardsDoneForMergedBranch, mutate } = vi.hoisted(() => ({
  markCardsDoneForMergedBranch: vi.fn().mockResolvedValue(0),
  mutate: vi.fn(),
}))
vi.mock('../api/markCardsDoneForMergedBranch', () => ({ markCardsDoneForMergedBranch }))
// The component's only use of SWR is the cache-wide `mutate` it calls after a sweep; handing it a
// spy is more direct than driving a real cache and asserting a refetch that has nothing to fetch.
vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr')
  return { ...actual, useSWRConfig: () => ({ mutate }) }
})

import { BoardMergeCompletion } from './BoardMergeCompletion'
import { appEventBus } from '../../../lib/appEventBus'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BoardMergeCompletion', () => {
  it('renders no markup of its own', () => {
    const { container } = render(<BoardMergeCompletion />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sweeps for the merged branch on merge_branch', () => {
    render(<BoardMergeCompletion />)
    act(() => {
      appEventBus.notify('merge_branch', { path: '/repo', source: 'feature/x' })
    })
    expect(markCardsDoneForMergedBranch).toHaveBeenCalledWith('/repo', 'feature/x')
  })

  it('ignores every other event on the bus', () => {
    render(<BoardMergeCompletion />)
    act(() => {
      appEventBus.notify('commit')
      appEventBus.notify('pr_closed_or_merged', { path: '/repo', source: 'feature/x' })
    })
    expect(markCardsDoneForMergedBranch).not.toHaveBeenCalled()
  })

  it('ignores a merge_branch event with a malformed payload', () => {
    render(<BoardMergeCompletion />)
    act(() => {
      appEventBus.notify('merge_branch', { path: '/repo' })
      appEventBus.notify('merge_branch')
      appEventBus.notify('merge_branch', 'feature/x')
    })
    expect(markCardsDoneForMergedBranch).not.toHaveBeenCalled()
  })

  /**
   * The sweep writes from outside every board's React tree, so a board on screen — or one sitting in
   * SWR's cache from the last time it was looked at — would go on showing the card where it used to
   * be. Only the board's own keys are revalidated: this says nothing about the graph, which the
   * merge itself already refreshed.
   */
  it('revalidates the board reads once the sweep has moved a card', async () => {
    markCardsDoneForMergedBranch.mockResolvedValue(2)
    render(<BoardMergeCompletion />)

    act(() => {
      appEventBus.notify('merge_branch', { path: '/repo', source: 'feature/x' })
    })

    await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    const matches = mutate.mock.calls[0][0] as (key: unknown) => boolean
    expect(matches(['board-detail', 'local', '/repo', 'b1', false])).toBe(true)
    expect(matches(['board-list', 'local', '/repo'])).toBe(true)
    expect(matches(['board-worktrees', '/repo'])).toBe(false)
    expect(matches(['branches', '/repo'])).toBe(false)
  })

  // Most merges touch no card at all, and re-reading every board for each of them is a cost with no
  // answer attached.
  it('leaves the board reads alone when nothing moved', async () => {
    markCardsDoneForMergedBranch.mockResolvedValue(0)
    render(<BoardMergeCompletion />)

    act(() => {
      appEventBus.notify('merge_branch', { path: '/repo', source: 'feature/x' })
    })

    await vi.waitFor(() => expect(markCardsDoneForMergedBranch).toHaveBeenCalled())
    expect(mutate).not.toHaveBeenCalled()
  })

  it('stops listening once unmounted', () => {
    const { unmount } = render(<BoardMergeCompletion />)
    unmount()
    act(() => {
      appEventBus.notify('merge_branch', { path: '/repo', source: 'feature/x' })
    })
    expect(markCardsDoneForMergedBranch).not.toHaveBeenCalled()
  })
})
