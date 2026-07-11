import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepRailRow, STEP_RAIL_ROW_HEIGHT } from './StepRailRow'

function baseProps(overrides: Partial<React.ComponentProps<typeof StepRailRow>> = {}) {
  return {
    index: 1,
    isLast: false,
    isSelected: false,
    title: 'pick abc123 Add feature',
    badgeLabel: 'pick',
    onRowClick: vi.fn(),
    onDragStart: vi.fn(),
    onDragOverRow: vi.fn(),
    onDrop: vi.fn(),
    testId: 'row',
    ...overrides,
  }
}

describe('StepRailRow', () => {
  it('renders title, subtitle, badge label and trailing caption', () => {
    render(
      <StepRailRow
        {...baseProps({ subtitle: 'abc123', trailingCaption: '2h ago' })}
      />
    )
    expect(screen.getByText('pick abc123 Add feature')).toBeInTheDocument()
    expect(screen.getByText('abc123')).toBeInTheDocument()
    expect(screen.getByText('pick')).toBeInTheDocument()
    expect(screen.getByText('2h ago')).toBeInTheDocument()
  })

  it('omits the subtitle and trailing caption when not provided', () => {
    render(<StepRailRow {...baseProps()} />)
    expect(screen.queryByText('abc123')).not.toBeInTheDocument()
  })

  it('calls onRowClick with the row index on click', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    render(<StepRailRow {...baseProps({ index: 3, onRowClick })} />)
    await user.click(screen.getByTestId('row'))
    expect(onRowClick).toHaveBeenCalledWith(3, expect.anything())
  })

  it('calls onDragStart with the row index', () => {
    const onDragStart = vi.fn()
    render(<StepRailRow {...baseProps({ index: 2, onDragStart })} />)
    fireEvent.dragStart(screen.getByTestId('row'))
    expect(onDragStart).toHaveBeenCalledWith(2)
  })

  it('calls onDragOverRow with the row index and prevents the default', () => {
    const onDragOverRow = vi.fn()
    render(<StepRailRow {...baseProps({ index: 2, onDragOverRow })} />)
    const event = fireEvent.dragOver(screen.getByTestId('row'))
    expect(onDragOverRow).toHaveBeenCalledWith(2)
    expect(event).toBe(false) // fireEvent returns false when preventDefault() was called
  })

  it('calls onDrop and prevents the default', () => {
    const onDrop = vi.fn()
    render(<StepRailRow {...baseProps({ onDrop })} />)
    const event = fireEvent.drop(screen.getByTestId('row'))
    expect(onDrop).toHaveBeenCalledOnce()
    expect(event).toBe(false)
  })

  it('applies the selected background class when isSelected', () => {
    render(<StepRailRow {...baseProps({ isSelected: true })} />)
    expect(screen.getByTestId('row').className).toContain('bg-accent')
  })

  // The GripVertical icon is itself made of <circle> elements, so queries must be scoped to the
  // second <svg> (the mini graph rail, the one after the grip icon), not the whole container.
  function railSvg(container: HTMLElement): SVGSVGElement {
    return container.querySelectorAll('svg')[1] as SVGSVGElement
  }

  it('strikes the title through and uses an outline dot for the "dropped" variant', () => {
    const { container } = render(<StepRailRow {...baseProps({ variant: 'dropped', title: 'drop abc' })} />)
    expect(screen.getByText('drop abc').className).toContain('line-through')
    const circle = railSvg(container).querySelector('circle')!
    expect(circle.getAttribute('r')).toBe('3.5')
    expect(circle.getAttribute('class')).toContain('fill-transparent')
  })

  it('draws a dashed folding curve for the "combined" variant', () => {
    const { container } = render(<StepRailRow {...baseProps({ variant: 'combined' })} />)
    const path = railSvg(container).querySelector('path')
    expect(path).not.toBeNull()
    expect(path).toHaveAttribute('stroke-dasharray', '3 2')
  })

  it('draws neither a path nor an outline dot for the default "normal" variant', () => {
    const { container } = render(<StepRailRow {...baseProps({ variant: 'normal' })} />)
    expect(railSvg(container).querySelector('path')).toBeNull()
    const circle = railSvg(container).querySelector('circle')!
    expect(circle.getAttribute('class')).toContain('fill-primary')
  })

  it('omits the top connector line for the first row (index 0) but draws it otherwise', () => {
    const { container: first } = render(<StepRailRow {...baseProps({ index: 0 })} />)
    expect(first.querySelectorAll('line')).toHaveLength(1) // only the bottom connector

    const { container: later } = render(<StepRailRow {...baseProps({ index: 1 })} />)
    expect(later.querySelectorAll('line')).toHaveLength(2)
  })

  it('omits the bottom connector line for the last row', () => {
    const { container } = render(<StepRailRow {...baseProps({ index: 1, isLast: true })} />)
    expect(container.querySelectorAll('line')).toHaveLength(1) // only the top connector
  })

  it('renders the row at the fixed STEP_RAIL_ROW_HEIGHT', () => {
    render(<StepRailRow {...baseProps()} />)
    expect(screen.getByTestId('row')).toHaveStyle({ height: `${STEP_RAIL_ROW_HEIGHT}px` })
  })
})
