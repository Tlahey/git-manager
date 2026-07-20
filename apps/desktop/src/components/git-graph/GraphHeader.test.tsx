import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ResolvedColumn } from './columns.config'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { GraphHeader } from './GraphHeader'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'
import { useSettingsStore } from '../../stores/settings.store'

const INITIAL = useGitGraphColumnsStore.getState()
const INITIAL_SETTINGS = useSettingsStore.getState()

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
  useSettingsStore.setState(INITIAL_SETTINGS, true)
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

  it('renders no resize handle for a single column (no boundary to drag)', () => {
    const columns = [col({ key: 'refs' })]
    const { container } = render(<GraphHeader columns={columns} />)
    expect(container.querySelectorAll('.cursor-col-resize')).toHaveLength(0)
  })

  it('renders one handle per adjacent-column boundary', () => {
    const columns = [
      col({ key: 'refs' }),
      col({ key: 'graph', labelKey: 'gitTree.columns.graph' }),
      col({ key: 'message', labelKey: 'gitTree.columns.message', flex: true }),
      col({ key: 'author', labelKey: 'gitTree.columns.author' }),
    ]
    const { container } = render(<GraphHeader columns={columns} />)
    // 4 columns → 3 boundaries → 3 handles (including one on the flex column).
    expect(container.querySelectorAll('.cursor-col-resize')).toHaveLength(3)
  })

  it('renders a handle on the flex column when a column follows it', () => {
    const columns = [col({ key: 'message', flex: true }), col({ key: 'author', flex: false })]
    const { container } = render(<GraphHeader columns={columns} />)
    // one boundary (message|author) → one handle, rendered on the flex column's right edge
    expect(container.querySelectorAll('.cursor-col-resize')).toHaveLength(1)
  })

  it('renders no handle after the last column even when it is flex', () => {
    const columns = [col({ key: 'refs' }), col({ key: 'message', flex: true })]
    const { container } = render(<GraphHeader columns={columns} />)
    // only the refs|message boundary → 1 handle; nothing trails the last column
    expect(container.querySelectorAll('.cursor-col-resize')).toHaveLength(1)
  })
})

describe('GraphHeader — resizing', () => {
  it('splits width between two fixed columns: left grows, right shrinks by the same delta', () => {
    const columns = [
      col({ key: 'refs', width: 160 }),
      col({ key: 'graph', labelKey: 'gitTree.columns.graph', width: 200 }),
    ]
    const { container } = render(<GraphHeader columns={columns} />)
    const handle = container.querySelector('.cursor-col-resize')!

    firePointer(handle, 'pointerdown', 100)
    firePointer(window, 'pointermove', 140) // +40
    firePointer(window, 'pointerup')

    expect(useGitGraphColumnsStore.getState().columns.refs?.width).toBe(200)
    expect(useGitGraphColumnsStore.getState().columns.graph?.width).toBe(160)
  })

  it('resizes refs against the flex column (not the capped graph) when graph is its neighbour', () => {
    // The refs|graph handle must not trade with graph (capped at its useful width, can't absorb);
    // it resizes refs and lets the flex `message` column absorb, leaving graph untouched.
    const columns = [
      col({ key: 'refs', width: 160 }),
      col({ key: 'graph', labelKey: 'gitTree.columns.graph', width: 120, maxWidth: 120 }),
      col({ key: 'message', labelKey: 'gitTree.columns.message', flex: true, width: 400 }),
    ]
    const graphBefore = useGitGraphColumnsStore.getState().columns.graph?.width
    const { container } = render(<GraphHeader columns={columns} />)
    // First handle sits at the refs|graph border.
    const handle = container.querySelectorAll('.cursor-col-resize')[0]

    firePointer(handle, 'pointerdown', 100)
    firePointer(window, 'pointermove', 140) // +40 → refs grows, message (flex) absorbs
    firePointer(window, 'pointerup')

    expect(useGitGraphColumnsStore.getState().columns.refs?.width).toBe(200)
    expect(useGitGraphColumnsStore.getState().columns.graph?.width).toBe(graphBefore)
  })

  it('resizes only the fixed neighbour when the other side is the flex column', () => {
    const columns = [
      col({ key: 'message', flex: true }),
      col({ key: 'author', flex: false, width: 150 }),
    ]
    const { container } = render(<GraphHeader columns={columns} />)
    const handle = container.querySelector('.cursor-col-resize')!

    firePointer(handle, 'pointerdown', 100)
    firePointer(window, 'pointermove', 140) // +40 → author (right side) shrinks by 40
    firePointer(window, 'pointerup')

    expect(useGitGraphColumnsStore.getState().columns.author?.width).toBe(110)
  })

  it('caps growth at the left column maxWidth (graph)', () => {
    const columns = [
      col({ key: 'graph', labelKey: 'gitTree.columns.graph', width: 100, maxWidth: 120 }),
      col({ key: 'message', labelKey: 'gitTree.columns.message', flex: true }),
    ]
    const { container } = render(<GraphHeader columns={columns} />)
    const handle = container.querySelector('.cursor-col-resize')!

    firePointer(handle, 'pointerdown', 100)
    firePointer(window, 'pointermove', 300)
    firePointer(window, 'pointerup')

    expect(useGitGraphColumnsStore.getState().columns.graph?.width).toBe(120)
  })

  it('caps a fixed column growth so the flex neighbour cannot shrink below its minWidth', () => {
    // The flex neighbour absorbs the opposite change; once it would hit its 100px min it can
    // no longer absorb, so the resize must stop instead of overflowing the row.
    const columns = [
      col({ key: 'refs', width: 160 }),
      col({ key: 'message', labelKey: 'gitTree.columns.message', flex: true, width: 300 }),
    ]
    const { container } = render(<GraphHeader columns={columns} />)
    const handle = container.querySelector('.cursor-col-resize')!

    firePointer(handle, 'pointerdown', 100)
    firePointer(window, 'pointermove', 500) // +400 requested, but message can only give up 300-100=200
    firePointer(window, 'pointerup')

    expect(useGitGraphColumnsStore.getState().columns.refs?.width).toBe(360) // 160 + 200
  })

  it('clamps the delta at the shrinking neighbour minWidth, keeping the sum constant', () => {
    const columns = [
      col({ key: 'refs', width: 160 }),
      col({ key: 'graph', labelKey: 'gitTree.columns.graph', width: 200 }),
    ]
    const { container } = render(<GraphHeader columns={columns} />)
    const handle = container.querySelector('.cursor-col-resize')!

    firePointer(handle, 'pointerdown', 100)
    firePointer(window, 'pointermove', 300) // +200 would push graph below its 100 min → clamp to +100
    firePointer(window, 'pointerup')

    expect(useGitGraphColumnsStore.getState().columns.graph?.width).toBe(100)
    expect(useGitGraphColumnsStore.getState().columns.refs?.width).toBe(260)
  })

  it('stops updating width after pointerup', () => {
    const columns = [
      col({ key: 'refs', width: 160 }),
      col({ key: 'graph', labelKey: 'gitTree.columns.graph', width: 200 }),
    ]
    const { container } = render(<GraphHeader columns={columns} />)
    const handle = container.querySelector('.cursor-col-resize')!

    firePointer(handle, 'pointerdown', 100)
    firePointer(window, 'pointerup')
    firePointer(window, 'pointermove', 999)

    expect(useGitGraphColumnsStore.getState().columns.refs?.width).toBe(160)
  })
})

describe('GraphHeader — compact graph label', () => {
  it('shows the text label at regular graph widths', () => {
    render(<GraphHeader columns={[col({ key: 'graph', labelKey: 'gitTree.columns.graph', width: 120 })]} />)
    expect(screen.getByText('gitTree.columns.graph')).toBeInTheDocument()
  })

  it('swaps the Graph label for an icon below the compact width threshold', () => {
    // Standard row height: compact below 70px (22 lane + 40 overlay + 8 margin)
    render(<GraphHeader columns={[col({ key: 'graph', labelKey: 'gitTree.columns.graph', width: 48 })]} />)
    expect(screen.queryByText('gitTree.columns.graph')).not.toBeInTheDocument()
    expect(screen.getByLabelText('gitTree.columns.graph')).toBeInTheDocument()
  })

  it('uses the smaller compact threshold with the small row height (24px avatar)', () => {
    useSettingsStore.setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        appearance: { ...s.settings.appearance, rowHeight: 'small' as const },
      },
    }))
    // Small avatar: compact below 62px (22 lane + 32 overlay + 8 margin), so 64 keeps the label.
    render(<GraphHeader columns={[col({ key: 'graph', labelKey: 'gitTree.columns.graph', width: 64 })]} />)
    expect(screen.getByText('gitTree.columns.graph')).toBeInTheDocument()
  })

  it('falls back to the standard row height when the setting is absent', () => {
    useSettingsStore.setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        appearance: { ...s.settings.appearance, rowHeight: undefined },
      },
    }))
    // Standard threshold applies: 64 < 70 → icon
    render(<GraphHeader columns={[col({ key: 'graph', labelKey: 'gitTree.columns.graph', width: 64 })]} />)
    expect(screen.queryByText('gitTree.columns.graph')).not.toBeInTheDocument()
  })
})

describe('GraphHeader — compact date/sha labels', () => {
  it('shows the text label for date and sha at regular widths', () => {
    render(
      <GraphHeader
        columns={[
          col({ key: 'date', labelKey: 'gitTree.columns.date', width: 110 }),
          col({ key: 'sha', labelKey: 'gitTree.columns.sha', width: 100 }),
        ]}
      />
    )
    expect(screen.getByText('gitTree.columns.date')).toBeInTheDocument()
    expect(screen.getByText('gitTree.columns.sha')).toBeInTheDocument()
  })

  it('swaps the date label for a calendar icon below the compact threshold', () => {
    const { container } = render(
      <GraphHeader columns={[col({ key: 'date', labelKey: 'gitTree.columns.date', width: 64 })]} />
    )
    expect(screen.queryByText('gitTree.columns.date')).not.toBeInTheDocument()
    expect(container.querySelector('.lucide-calendar')).toBeTruthy()
    expect(screen.getByLabelText('gitTree.columns.date')).toBeInTheDocument()
  })

  it('swaps the sha label for a hash icon below the compact threshold', () => {
    const { container } = render(
      <GraphHeader columns={[col({ key: 'sha', labelKey: 'gitTree.columns.sha', width: 64 })]} />
    )
    expect(screen.queryByText('gitTree.columns.sha')).not.toBeInTheDocument()
    expect(container.querySelector('.lucide-hash')).toBeTruthy()
    expect(screen.getByLabelText('gitTree.columns.sha')).toBeInTheDocument()
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
