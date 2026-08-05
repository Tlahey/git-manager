import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitGraphNode } from '@git-manager/git-types'
import { useTimelinePreviewAnchor } from './useTimelinePreviewAnchor'

function nodes(...oids: string[]): GitGraphNode[] {
  return oids.map(
    (oid) => ({ commit: { oid, shortOid: oid }, refs: [] }) as unknown as GitGraphNode
  )
}

const scrollToIndex = vi.fn()

function setup(previewOid: string | null, list = nodes('c', 'b', 'a'), active = true) {
  return renderHook(
    ({ oid, filteredNodes, on }) =>
      useTimelinePreviewAnchor({
        active: on,
        previewOid: oid,
        filteredNodes,
        scrollToIndex,
      }),
    { initialProps: { oid: previewOid, filteredNodes: list, on: active } }
  )
}

beforeEach(() => vi.clearAllMocks())

describe('useTimelinePreviewAnchor', () => {
  it('brings the previewed commit to a fixed place on screen', () => {
    setup('a')
    expect(scrollToIndex).toHaveBeenCalledWith(2, { align: 'center' })
  })

  it('anchors once per step, not once per render', () => {
    // The previewed log arrives in several renders; re-scrolling on each would fight the user.
    const { rerender } = setup('a')
    rerender({ oid: 'a', filteredNodes: nodes('c', 'b', 'a'), on: true })
    expect(scrollToIndex).toHaveBeenCalledTimes(1)
  })

  it('waits for the previewed log rather than giving up on the step', () => {
    const { rerender } = setup('zzz')
    expect(scrollToIndex).not.toHaveBeenCalled()

    rerender({ oid: 'zzz', filteredNodes: nodes('zzz', 'a'), on: true })
    expect(scrollToIndex).toHaveBeenCalledWith(0, { align: 'center' })
  })

  it('re-anchors when the timeline moves to another step', () => {
    const { rerender } = setup('a')
    rerender({ oid: 'b', filteredNodes: nodes('c', 'b', 'a'), on: true })
    expect(scrollToIndex).toHaveBeenLastCalledWith(1, { align: 'center' })
  })

  it('does nothing for a step that moves no HEAD', () => {
    setup(null)
    expect(scrollToIndex).not.toHaveBeenCalled()
  })

  it('hands scrolling back on close, and re-anchors on the next opening', () => {
    const { rerender } = setup('a')
    expect(scrollToIndex).toHaveBeenCalledTimes(1)

    rerender({ oid: 'a', filteredNodes: nodes('c', 'b', 'a'), on: false })
    rerender({ oid: 'a', filteredNodes: nodes('c', 'b', 'a'), on: true })
    expect(scrollToIndex).toHaveBeenCalledTimes(2)
  })

  it('stays out of the way while the timeline is closed', () => {
    setup('a', nodes('c', 'b', 'a'), false)
    expect(scrollToIndex).not.toHaveBeenCalled()
  })
})
