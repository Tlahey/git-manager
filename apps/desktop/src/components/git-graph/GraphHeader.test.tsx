import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ResolvedColumn } from './columns'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { GraphHeader } from './GraphHeader'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'

const INITIAL = useGitGraphColumnsStore.getState()

// jsdom has no PointerEvent constructor, and testing-library's fireEvent.pointerDown silently
// drops clientX when it falls back to a plain Event — so we build/dispatch pointer events by
// hand (a plain Event with clientX assigned as an own property) for both the React-handled
// pointerdown on the handle and the raw window.addEventListener('pointermove'/'pointerup', ...)
// pair the component wires up itself.
function firePointer(
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX?: number
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  if (clientX !== undefined)
    Object.defineProperty(event, 'clientX', { value: clientX, configurable: true })
  target.dispatchEvent(event)
}

function col(overrides: Partial<ResolvedColumn>): ResolvedColumn {
  return {
    key: 'refs',
    labelKey: 'gitTree.columns.refs',
    defaultWidth: 160,
    minWidth: 100,
    defaultVisible: true,
    width: 160,
    ...overrides,
  }
}

beforeEach(() => {
  useGitGraphColumnsStore.setState(INITIAL, true)
})

describe('GraphHeader — rendering', () => {
  it('renders every column label in order', () => {
    const columns = [
      col({ key: 'refs', labelKey: 'gitTree.columns.refs' }),
      col({ key: 'graph', labelKey: 'gitTree.columns.graph' }),
    ]
    render(<GraphHeader columns={columns} />)
    expect(screen.getByText('gitTree.columns.refs')).toBeInTheDocument()
    expect(screen.getByText('gitTree.columns.graph')).toBeInTheDocument()
  })

  it('does not render a left resize handle for the first column', () => {
    const columns = [col({ key: 'refs' })]
    const { container } = render(<GraphHeader columns={columns} />)
    // only one handle group should exist: the right-side one (col is not flex)
    expect(container.querySelectorAll('.cursor-col-resize')).toHaveLength(1)
  })

  it('renders a left resize handle when the previous column is flex', () => {
    const columns = [col({ key: 'message', flex: true }), col({ key: 'author', flex: false })]
    const { container } = render(<GraphHeader columns={columns} />)
    // message (flex): no left handle (first), no right handle (flex) => 0
    // author: gets a left handle (prev is flex) + a right handle (not flex) => 2
    expect(container.querySelectorAll('.cursor-col-resize')).toHaveLength(2)
  })

  it('omits the right resize handle for a flex column', () => {
    const columns = [col({ key: 'message', flex: true })]
    const { container } = render(<GraphHeader columns={columns} />)
    expect(container.querySelectorAll('.cursor-col-resize')).toHaveLength(0)
  })
})

describe('GraphHeader — resizing', () => {
  it('grows the column width when dragging the right handle to the right', () => {
    const columns = [col({ key: 'refs', width: 160 })]
    const { container } = render(<GraphHeader columns={columns} />)
    const handle = container.querySelector('.cursor-col-resize')!

    firePointer(handle, 'pointerdown', 100)
    firePointer(window, 'pointermove', 140)
    firePointer(window, 'pointerup')

    expect(useGitGraphColumnsStore.getState().columns.refs?.width).toBe(200)
  })

  it('shrinks the column width when dragging the left handle to the right (inverted delta)', () => {
    const columns = [
      col({ key: 'message', flex: true }),
      col({ key: 'author', flex: false, width: 150 }),
    ]
    const { container } = render(<GraphHeader columns={columns} />)
    const leftHandle = container.querySelectorAll('.cursor-col-resize')[0]

    firePointer(leftHandle, 'pointerdown', 100)
    firePointer(window, 'pointermove', 140)
    firePointer(window, 'pointerup')

    // fromLeft: newWidth = startWidth - delta = 150 - 40 = 110
    expect(useGitGraphColumnsStore.getState().columns.author?.width).toBe(110)
  })

  it('stops updating width after pointerup', () => {
    const columns = [col({ key: 'refs', width: 160 })]
    const { container } = render(<GraphHeader columns={columns} />)
    const handle = container.querySelector('.cursor-col-resize')!

    firePointer(handle, 'pointerdown', 100)
    firePointer(window, 'pointerup')
    firePointer(window, 'pointermove', 999)

    expect(useGitGraphColumnsStore.getState().columns.refs?.width).toBe(160)
  })
})

describe('GraphHeader — column menu', () => {
  it('opens the columns context menu on right-click', () => {
    const columns = [col({ key: 'refs' })]
    render(<GraphHeader columns={columns} />)
    fireEvent.contextMenu(screen.getByText('gitTree.columns.refs'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
