import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardKindPicker } from './CardKindPicker'

describe('CardKindPicker', () => {
  it('shows all three kinds at once, named', () => {
    render(<CardKindPicker value="task" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: /Task/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Bug/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Epic/ })).toBeInTheDocument()
  })

  it('marks the current kind as the selected radio', () => {
    render(<CardKindPicker value="epic" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: /Epic/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Task/ })).not.toBeChecked()
  })

  it('reports the picked kind', async () => {
    const onChange = vi.fn()
    render(<CardKindPicker value="task" onChange={onChange} />)
    await userEvent.click(screen.getByTestId('card-kind-option-bug'))
    expect(onChange).toHaveBeenCalledWith('bug')
  })

  it('picks nothing while disabled', async () => {
    const onChange = vi.fn()
    render(<CardKindPicker value="task" onChange={onChange} disabled />)
    await userEvent.click(screen.getByTestId('card-kind-option-bug'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
