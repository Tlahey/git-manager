import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardKindIcon } from './CardKindIcon'

describe('CardKindIcon', () => {
  it('names each kind for a screen reader', () => {
    const { rerender } = render(<CardKindIcon kind="task" />)
    expect(screen.getByLabelText('Task')).toBeTruthy()

    rerender(<CardKindIcon kind="bug" />)
    expect(screen.getByLabelText('Bug')).toBeTruthy()

    rerender(<CardKindIcon kind="epic" />)
    expect(screen.getByLabelText('Epic')).toBeTruthy()
  })

  it('gives each kind its own testid', () => {
    render(<CardKindIcon kind="epic" />)
    expect(screen.getByTestId('card-kind-epic')).toBeTruthy()
  })

  it('spells the kind out only when asked', () => {
    const { rerender } = render(<CardKindIcon kind="bug" />)
    expect(screen.queryByText('Bug')).toBeNull()

    rerender(<CardKindIcon kind="bug" withLabel />)
    expect(screen.getByText('Bug')).toBeTruthy()
  })
})
