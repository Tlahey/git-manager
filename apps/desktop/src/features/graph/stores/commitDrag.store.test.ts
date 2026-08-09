import { beforeEach, describe, expect, it } from 'vitest'
import { useCommitDragStore, dropIndicatorFor } from './commitDrag.store'

describe('useCommitDragStore', () => {
  beforeEach(() => useCommitDragStore.getState().endDrag())

  it('tracks the dragged commits and clears the target when a new drag starts', () => {
    useCommitDragStore.getState().setDropTarget({ kind: 'combine', oid: 'a' })
    useCommitDragStore.getState().startDrag(['b', 'c'])
    expect(useCommitDragStore.getState().draggingOids).toEqual(['b', 'c'])
    expect(useCommitDragStore.getState().dropTarget).toBeNull()
  })

  it('forgets everything once the drag ends', () => {
    useCommitDragStore.getState().startDrag(['b'])
    useCommitDragStore.getState().setDropTarget({ kind: 'gap', oid: 'a', edge: 'above' })
    useCommitDragStore.getState().endDrag()
    expect(useCommitDragStore.getState().draggingOids).toEqual([])
    expect(useCommitDragStore.getState().dropTarget).toBeNull()
  })
})

describe('dropIndicatorFor', () => {
  it('draws nothing on a row that is not the target', () => {
    expect(dropIndicatorFor({ kind: 'combine', oid: 'a' }, 'b')).toBeNull()
    expect(dropIndicatorFor(null, 'a')).toBeNull()
  })

  it('maps the target kind onto the row decoration', () => {
    expect(dropIndicatorFor({ kind: 'combine', oid: 'a' }, 'a')).toBe('combine')
    expect(dropIndicatorFor({ kind: 'gap', oid: 'a', edge: 'above' }, 'a')).toBe('gap-above')
    expect(dropIndicatorFor({ kind: 'gap', oid: 'a', edge: 'below' }, 'a')).toBe('gap-below')
  })
})
