import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, createEvent, act } from '@testing-library/react'
import { useCommitDragStore, COMMIT_DRAG_MIME } from '../stores/commitDrag.store'
import { CommitDragProvider } from './CommitDragProvider'
import type { CommitDragContextValue } from '../hooks/useCommitRowDrag'
import { CommitDragSlot } from './CommitDragSlot'

const onDrop = vi.fn()

function context(reorderable: string[] = ['a', 'b']): CommitDragContextValue {
  return {
    reorderable: new Set(reorderable),
    selectedOids: new Set<string>(),
    dragLabel: (count) => `${count} commits`,
    onDrop,
  }
}

/** Two slots stacked as the virtualizer lays them out: 40px each, no gap between them. */
function renderSlots(value = context()) {
  const result = render(
    <CommitDragProvider value={value}>
      <CommitDragSlot oid="a" testId="slot-a" selected={false} style={{ height: 40 }}>
        <span>row a</span>
      </CommitDragSlot>
      <CommitDragSlot oid="b" testId="slot-b" selected={false} style={{ height: 40 }}>
        <span>row b</span>
      </CommitDragSlot>
    </CommitDragProvider>
  )
  // jsdom measures everything as zero-sized, so the slot geometry has to be stated.
  stubRect(screen.getByTestId('slot-a'), 0, 40)
  stubRect(screen.getByTestId('slot-b'), 40, 40)
  return result
}

function stubRect(element: Element, top: number, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  })
}

function transfer(types: string[] = [COMMIT_DRAG_MIME]) {
  return { types, dropEffect: '', effectAllowed: '', setData: vi.fn(), setDragImage: vi.fn() }
}

/** jsdom builds `dragover` from a plain `Event`, which drops `clientY` — and where in the slot the
 * cursor sits is the whole point of the handler. Set it on the event object instead. */
function dragOverAt(element: Element, clientY: number, types?: string[]) {
  const event = createEvent.dragOver(element, { dataTransfer: transfer(types) })
  Object.defineProperty(event, 'clientY', { value: clientY })
  fireEvent(element, event)
}

beforeEach(() => {
  vi.clearAllMocks()
  act(() => useCommitDragStore.getState().endDrag())
})

describe('CommitDragSlot — the drop surface covers the whole slot', () => {
  it('accepts a drop aimed at the gutter between two rows, where the row itself ends', () => {
    // 4px above the slot boundary: inside slot A's bottom margin — the band that used to be inert,
    // and the one the cursor is in when the user means "insert between these two commits".
    renderSlots()
    fireEvent.dragStart(screen.getByTestId('slot-b'), { dataTransfer: transfer() })
    dragOverAt(screen.getByTestId('slot-a'), 38)
    expect(useCommitDragStore.getState().dropTarget).toEqual({
      kind: 'gap',
      oid: 'a',
      edge: 'below',
    })

    fireEvent.drop(screen.getByTestId('slot-a'), { dataTransfer: transfer() })
    expect(onDrop).toHaveBeenCalledWith({ kind: 'gap', oid: 'a', edge: 'below' }, ['b'])
  })

  it('splits the slot into gap / combine / gap quarters', () => {
    renderSlots()
    const slot = screen.getByTestId('slot-b')

    dragOverAt(slot, 45) // 5px into a 40px slot
    expect(useCommitDragStore.getState().dropTarget).toMatchObject({ edge: 'above' })

    dragOverAt(slot, 60) // middle
    expect(useCommitDragStore.getState().dropTarget).toEqual({ kind: 'combine', oid: 'b' })

    dragOverAt(slot, 75) // 5px from the bottom
    expect(useCommitDragStore.getState().dropTarget).toMatchObject({ edge: 'below' })
  })

  it('draws the gap line on the slot boundary, not inside one row', () => {
    renderSlots()
    act(() => useCommitDragStore.getState().setDropTarget({ kind: 'gap', oid: 'a', edge: 'below' }))
    expect(screen.getByTestId('commit-drop-gap-below')).toHaveClass('bottom-0')
  })
})

describe('CommitDragSlot — drag source', () => {
  it('stays inert until the left button goes down, so right-click still opens the menu', () => {
    renderSlots()
    const slot = screen.getByTestId('slot-a')
    expect(slot).not.toHaveAttribute('draggable', 'true')
    fireEvent.mouseDown(slot, { button: 0 })
    expect(slot).toHaveAttribute('draggable', 'true')
  })

  it('never arms a commit the rebase cannot move', () => {
    renderSlots(context([]))
    const slot = screen.getByTestId('slot-a')
    fireEvent.mouseDown(slot, { button: 0 })
    expect(slot).not.toHaveAttribute('draggable', 'true')
  })

  it('fades the slots whose commits are in flight', () => {
    renderSlots()
    fireEvent.dragStart(screen.getByTestId('slot-a'), { dataTransfer: transfer() })
    expect(screen.getByTestId('slot-a')).toHaveClass('opacity-40')
    expect(screen.getByTestId('slot-b')).not.toHaveClass('opacity-40')
  })

  it('keeps the row identity attributes the graph and the e2e suite rely on', () => {
    render(
      <CommitDragProvider value={context()}>
        <CommitDragSlot
          oid="a"
          testId="graph-row-a"
          selected
          className="hover:z-graph-row-hover"
          style={{ height: 40 }}
        >
          <span>row</span>
        </CommitDragSlot>
      </CommitDragProvider>
    )
    const slot = screen.getByTestId('graph-row-a')
    expect(slot).toHaveAttribute('data-selected', 'true')
    expect(slot).toHaveClass('hover:z-graph-row-hover')
  })

  it('leaves drag off entirely outside the provider', () => {
    render(
      <CommitDragSlot oid="a" testId="slot-a" selected={false} style={{ height: 40 }}>
        <span>row</span>
      </CommitDragSlot>
    )
    const slot = screen.getByTestId('slot-a')
    fireEvent.mouseDown(slot, { button: 0 })
    expect(slot).not.toHaveAttribute('draggable')
  })
})
