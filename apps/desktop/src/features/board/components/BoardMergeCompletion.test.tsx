import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'

const { markCardsDoneForMergedBranch } = vi.hoisted(() => ({
  markCardsDoneForMergedBranch: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../api/markCardsDoneForMergedBranch', () => ({ markCardsDoneForMergedBranch }))

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

  it('stops listening once unmounted', () => {
    const { unmount } = render(<BoardMergeCompletion />)
    unmount()
    act(() => {
      appEventBus.notify('merge_branch', { path: '/repo', source: 'feature/x' })
    })
    expect(markCardsDoneForMergedBranch).not.toHaveBeenCalled()
  })
})
