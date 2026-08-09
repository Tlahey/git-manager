import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, createEvent, act } from '@testing-library/react'
import { useCommitDragStore } from '../stores/commitDrag.store'
import { useRefDragStore } from '../stores/refDrag.store'
import { CommitDragProvider } from './CommitDragProvider'
import { useCommitRowDrag, type CommitDragContextValue } from '../hooks/useCommitRowDrag'

/** A stand-in for `CommitDragSlot`: it does exactly what the real slot does with the output. */
function Row({ oid }: { oid: string }) {
  const { rowProps, isDragging, indicator } = useCommitRowDrag(oid)
  return (
    <div
      data-testid={`row-${oid}`}
      data-dragging={isDragging || undefined}
      data-indicator={indicator ?? undefined}
      {...rowProps}
    />
  )
}

const onDrop = vi.fn()

function context(overrides: Partial<CommitDragContextValue> = {}): CommitDragContextValue {
  return {
    reorderable: new Set(['a', 'b']),
    selectedOids: new Set<string>(),
    dragLabel: (count) => `${count} commits`,
    onDrop,
    ...overrides,
  }
}

function renderRows(value = context()) {
  return render(
    <CommitDragProvider value={value}>
      <Row oid="a" />
      <Row oid="b" />
      <Row oid="offBranch" />
    </CommitDragProvider>
  )
}

/** A `DataTransfer` jsdom can carry — its own implementation has no `types` support. */
function transfer(types: string[] = ['application/x-gm-commits']) {
  return {
    types,
    dropEffect: '',
    effectAllowed: '',
    setData: vi.fn(),
    setDragImage: vi.fn(),
  }
}

/**
 * jsdom builds `dragover` from a plain `Event`, which drops `clientY` — and the whole point of the
 * handler is where in the row the cursor is. Set it on the event object instead of trusting
 * `fireEvent`'s init.
 */
function dragOverAt(element: Element, clientY: number, types?: string[]) {
  const event = createEvent.dragOver(element, { dataTransfer: transfer(types) })
  Object.defineProperty(event, 'clientY', { value: clientY })
  fireEvent(element, event)
}

/** jsdom gives every element a zero-sized rect, so the drop band has to be faked per row. */
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

beforeEach(() => {
  vi.clearAllMocks()
  act(() => useCommitDragStore.getState().endDrag())
  act(() => useRefDragStore.getState().endDrag())
})

describe('useCommitRowDrag — becoming a drag source', () => {
  it('stays inert until the left button goes down, so right-click still opens the menu', () => {
    renderRows()
    const row = screen.getByTestId('row-a')
    expect(row).not.toHaveAttribute('draggable', 'true')
    fireEvent.mouseDown(row, { button: 0 })
    expect(row).toHaveAttribute('draggable', 'true')
  })

  it('never arms a commit the rebase cannot move', () => {
    renderRows()
    const row = screen.getByTestId('row-offBranch')
    fireEvent.mouseDown(row, { button: 0 })
    expect(row).not.toHaveAttribute('draggable', 'true')
  })

  it('disarms on the next mouse release anywhere', () => {
    renderRows()
    const row = screen.getByTestId('row-a')
    fireEvent.mouseDown(row, { button: 0 })
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'))
    })
    expect(row).not.toHaveAttribute('draggable', 'true')
  })

  it('carries the whole selection when the grabbed row is part of it', () => {
    renderRows(context({ selectedOids: new Set(['a', 'b']) }))
    fireEvent.dragStart(screen.getByTestId('row-a'), { dataTransfer: transfer() })
    expect(useCommitDragStore.getState().draggingOids.sort()).toEqual(['a', 'b'])
    expect(screen.getByTestId('row-b')).toHaveAttribute('data-dragging', 'true')
  })

  it('carries the grabbed row alone when it sits outside the selection', () => {
    renderRows(context({ selectedOids: new Set(['b']) }))
    fireEvent.dragStart(screen.getByTestId('row-a'), { dataTransfer: transfer() })
    expect(useCommitDragStore.getState().draggingOids).toEqual(['a'])
  })

  it('stands aside for a ref badge drag started inside the row', () => {
    renderRows()
    act(() =>
      useRefDragStore
        .getState()
        .startDrag({ name: 'main', shortName: 'main', type: 'branch', commitOid: 'a' })
    )
    fireEvent.dragStart(screen.getByTestId('row-a'), { dataTransfer: transfer() })
    expect(useCommitDragStore.getState().draggingOids).toEqual([])
  })
})

describe('useCommitRowDrag — aiming the drop', () => {
  it('reads the row middle as a combine and its edges as gaps', () => {
    renderRows()
    const row = screen.getByTestId('row-b')
    stubRect(row, 100, 40)

    dragOverAt(row, 120)
    expect(row).toHaveAttribute('data-indicator', 'combine')

    dragOverAt(row, 102)
    expect(row).toHaveAttribute('data-indicator', 'gap-above')

    dragOverAt(row, 138)
    expect(row).toHaveAttribute('data-indicator', 'gap-below')
  })

  it('clears the aim over a commit the rebase cannot touch', () => {
    renderRows()
    const target = screen.getByTestId('row-b')
    stubRect(target, 100, 40)
    dragOverAt(target, 120)
    expect(useCommitDragStore.getState().dropTarget).not.toBeNull()

    dragOverAt(screen.getByTestId('row-offBranch'), 120)
    expect(useCommitDragStore.getState().dropTarget).toBeNull()
  })

  it('ignores a drag that is not ours', () => {
    renderRows()
    const row = screen.getByTestId('row-b')
    stubRect(row, 100, 40)
    dragOverAt(row, 120, ['text/plain'])
    expect(useCommitDragStore.getState().dropTarget).toBeNull()
  })
})

describe('useCommitRowDrag — dropping', () => {
  it('hands the aimed target and the dragged commits to the graph', () => {
    renderRows()
    fireEvent.dragStart(screen.getByTestId('row-a'), { dataTransfer: transfer() })
    const target = screen.getByTestId('row-b')
    stubRect(target, 100, 40)
    dragOverAt(target, 120)
    fireEvent.drop(target, { dataTransfer: transfer() })

    expect(onDrop).toHaveBeenCalledWith({ kind: 'combine', oid: 'b' }, ['a'])
    expect(useCommitDragStore.getState().draggingOids).toEqual([])
  })

  it('reports nothing when the drop lands with no valid aim', () => {
    renderRows()
    fireEvent.dragStart(screen.getByTestId('row-a'), { dataTransfer: transfer() })
    fireEvent.drop(screen.getByTestId('row-offBranch'), { dataTransfer: transfer() })
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('forgets the drag when it is cancelled instead of dropped', () => {
    renderRows()
    fireEvent.dragStart(screen.getByTestId('row-a'), { dataTransfer: transfer() })
    fireEvent.dragEnd(screen.getByTestId('row-a'))
    expect(useCommitDragStore.getState().draggingOids).toEqual([])
    expect(onDrop).not.toHaveBeenCalled()
  })
})

describe('useCommitRowDrag — outside a provider', () => {
  it('disables drag entirely rather than half-wiring it', () => {
    render(<Row oid="a" />)
    const row = screen.getByTestId('row-a')
    expect(row).not.toHaveAttribute('draggable')
    fireEvent.mouseDown(row, { button: 0 })
    expect(row).not.toHaveAttribute('draggable')
  })
})
