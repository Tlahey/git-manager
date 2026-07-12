import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LayersPanel, type LayerEntry } from './LayersPanel'

const LAYERS: LayerEntry[] = [
  { zone: 't1', x: 598, y: 227 }, // paint 0 = furthest back
  { zone: 't6', x: 327, y: 473 },
  { zone: 'head', x: 313, y: 110 }, // paint 2 = frontmost
]

function mount(overrides: Partial<Parameters<typeof LayersPanel>[0]> = {}) {
  const props = {
    layers: LAYERS,
    selected: null as number | null,
    uriFor: () => null as string | null,
    onSelect: vi.fn(),
    onReorder: vi.fn(),
    ...overrides,
  }
  render(<LayersPanel {...props} />)
  return props
}

describe('LayersPanel', () => {
  it('lists layers front-to-back (frontmost placement on top)', () => {
    mount()
    const rows = screen.getByTestId('layers-panel').querySelectorAll('[data-testid^="layer-row-"]')
    expect([...rows].map((r) => r.getAttribute('data-testid'))).toEqual([
      'layer-row-head',
      'layer-row-t6',
      'layer-row-t1',
    ])
  })

  it('shows each layer position and its paint-order rank', () => {
    mount()
    const rowT6 = screen.getByTestId('layer-row-t6')
    expect(rowT6.textContent).toContain('(327, 473)')
    expect(rowT6.textContent).toContain('2/3')
  })

  it('reports the paint-order index on click', () => {
    const { onSelect } = mount()
    fireEvent.click(screen.getByTestId('layer-row-t1'))
    expect(onSelect).toHaveBeenCalledWith(0)
    fireEvent.click(screen.getByTestId('layer-row-head'))
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('highlights the selected layer', () => {
    mount({ selected: 1 })
    expect(screen.getByTestId('layer-row-t6').style.background).not.toBe('transparent')
    expect(screen.getByTestId('layer-row-t1').style.background).toBe('transparent')
  })

  it('calls onReorder(from, to) in paint-order indices after a drag and drop', () => {
    const { onReorder } = mount()
    fireEvent.dragStart(screen.getByTestId('layer-row-t1'))
    fireEvent.dragOver(screen.getByTestId('layer-row-head'))
    fireEvent.drop(screen.getByTestId('layer-row-head'))
    expect(onReorder).toHaveBeenCalledWith(0, 2)
  })

  it('does not reorder when a row is dropped onto itself', () => {
    const { onReorder } = mount()
    fireEvent.dragStart(screen.getByTestId('layer-row-t6'))
    fireEvent.drop(screen.getByTestId('layer-row-t6'))
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('renders a thumbnail when the zone has a slice URI', () => {
    mount({ uriFor: (zone) => (zone === 't6' ? 'data:image/png;base64,x' : null) })
    const img = screen.getByTestId('layer-row-t6').querySelector('img')
    expect(img).not.toBeNull()
    expect(screen.getByTestId('layer-row-t1').querySelector('img')).toBeNull()
  })
})
