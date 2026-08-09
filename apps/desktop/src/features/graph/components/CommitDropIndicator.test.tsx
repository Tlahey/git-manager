import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CommitDropIndicator } from './CommitDropIndicator'

describe('CommitDropIndicator', () => {
  it('draws nothing on a row that is not the drop target', () => {
    const { container } = render(<CommitDropIndicator indicator={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('rings the row a drop would fold commits into', () => {
    render(<CommitDropIndicator indicator="combine" />)
    expect(screen.getByTestId('commit-drop-combine')).toBeInTheDocument()
  })

  it('lines the slot boundary the commits would slide into', () => {
    const { rerender } = render(<CommitDropIndicator indicator="gap-above" />)
    expect(screen.getByTestId('commit-drop-gap-above')).toHaveClass('top-0')
    rerender(<CommitDropIndicator indicator="gap-below" />)
    expect(screen.getByTestId('commit-drop-gap-below')).toHaveClass('bottom-0')
  })
})
