import { describe, it, expect, beforeEach } from 'vitest'
import type { GitRef } from '@git-manager/git-types'
import { useRefDragStore, isValidRefDropTarget, isSameRef } from './refDrag.store'

const branch = (shortName: string): GitRef => ({
  name: `refs/heads/${shortName}`,
  shortName,
  type: 'branch',
  commitOid: 'abc123',
})

describe('useRefDragStore', () => {
  beforeEach(() => {
    useRefDragStore.setState({ draggingRef: null, hoverRef: null })
  })

  it('tracks the ref being dragged and the sticky hover target', () => {
    const feat = branch('feat')
    const main = branch('main')
    useRefDragStore.getState().startDrag(feat)
    useRefDragStore.getState().setHoverRef(main)
    expect(useRefDragStore.getState().draggingRef).toBe(feat)
    expect(useRefDragStore.getState().hoverRef).toBe(main)
  })

  it('clears both the dragged ref and the hover target on drag end', () => {
    useRefDragStore.getState().startDrag(branch('feat'))
    useRefDragStore.getState().setHoverRef(branch('main'))
    useRefDragStore.getState().endDrag()
    expect(useRefDragStore.getState().draggingRef).toBeNull()
    expect(useRefDragStore.getState().hoverRef).toBeNull()
  })
})

describe('isSameRef', () => {
  it('matches on name + type, and is false for null operands', () => {
    expect(isSameRef(branch('main'), branch('main'))).toBe(true)
    expect(isSameRef(branch('main'), branch('feat'))).toBe(false)
    expect(isSameRef(null, branch('main'))).toBe(false)
    const tag: GitRef = { name: 'refs/tags/main', shortName: 'main', type: 'tag', commitOid: 'x' }
    expect(isSameRef(branch('main'), tag)).toBe(false)
  })
})

describe('isValidRefDropTarget', () => {
  it('is false when nothing is being dragged', () => {
    expect(isValidRefDropTarget(null, branch('main'))).toBe(false)
  })

  it('is false when dropping a ref onto itself', () => {
    const main = branch('main')
    expect(isValidRefDropTarget(main, branch('main'))).toBe(false)
  })

  it('is true for a different ref', () => {
    expect(isValidRefDropTarget(branch('feat'), branch('main'))).toBe(true)
  })

  it('distinguishes a branch and a tag sharing a short name', () => {
    const tag: GitRef = { name: 'refs/tags/v1', shortName: 'v1', type: 'tag', commitOid: 'x' }
    expect(isValidRefDropTarget(branch('v1'), tag)).toBe(true)
  })
})
