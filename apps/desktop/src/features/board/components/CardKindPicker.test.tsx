import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardKindPicker } from './CardKindPicker'

describe('CardKindPicker', () => {
  it('shows the current kind with its colour, closed', () => {
    render(<CardKindPicker value="epic" onChange={vi.fn()} />)
    const trigger = screen.getByTestId('card-kind-select')
    expect(trigger).toHaveTextContent('Epic')
    // The tile the board recognises an epic by, in the field itself — what a native select overdrew.
    expect(within(trigger).getByTestId('card-kind-epic')).toBeInTheDocument()
  })

  it('offers all three kinds, named and coloured', async () => {
    render(<CardKindPicker value="task" onChange={vi.fn()} />)

    await userEvent.click(screen.getByTestId('card-kind-select'))

    for (const [kind, label] of [
      ['task', 'Task'],
      ['bug', 'Bug'],
      ['epic', 'Epic'],
    ] as const) {
      const option = screen.getByTestId(`card-kind-${kind}-option`)
      expect(option).toHaveTextContent(label)
      expect(within(option).getByTestId(`card-kind-${kind}`)).toBeInTheDocument()
    }
  })

  it('reports the picked kind', async () => {
    const onChange = vi.fn()
    render(<CardKindPicker value="task" onChange={onChange} />)

    await userEvent.click(screen.getByTestId('card-kind-select'))
    await userEvent.click(screen.getByTestId('card-kind-bug-option'))

    expect(onChange).toHaveBeenCalledWith('bug')
  })

  it('opens nothing while disabled', async () => {
    const onChange = vi.fn()
    render(<CardKindPicker value="task" onChange={onChange} disabled />)

    expect(screen.getByTestId('card-kind-select')).toBeDisabled()
    await userEvent.click(screen.getByTestId('card-kind-select'))

    expect(screen.queryByTestId('card-kind-bug-option')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
