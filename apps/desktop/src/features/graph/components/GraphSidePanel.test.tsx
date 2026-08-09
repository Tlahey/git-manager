import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GraphSidePanel } from './GraphSidePanel'

function resizeProps() {
  return {
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
  }
}

describe('GraphSidePanel', () => {
  it('renders its children at the given width', () => {
    render(
      <GraphSidePanel resizeProps={resizeProps()} width={420}>
        <div data-testid="panel-body">content</div>
      </GraphSidePanel>
    )
    expect(screen.getByTestId('panel-body')).toBeInTheDocument()
    expect(screen.getByTestId('panel-body').parentElement).toHaveStyle({ width: '420px' })
  })

  it('wires the resize handle to the drag handlers', () => {
    const props = resizeProps()
    const { container } = render(
      <GraphSidePanel resizeProps={props} width={400}>
        <div>content</div>
      </GraphSidePanel>
    )
    const handle = container.querySelector('.cursor-col-resize') as HTMLElement
    expect(handle).not.toBeNull()

    fireEvent.pointerDown(handle)
    expect(props.onPointerDown).toHaveBeenCalledOnce()
    fireEvent.pointerMove(handle)
    expect(props.onPointerMove).toHaveBeenCalledOnce()
    fireEvent.pointerUp(handle)
    expect(props.onPointerUp).toHaveBeenCalledOnce()
  })
})
