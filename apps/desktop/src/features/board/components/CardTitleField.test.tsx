import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardTitleField } from './CardTitleField'

function renderField(props: Partial<React.ComponentProps<typeof CardTitleField>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<CardTitleField title="Fix the header" onSave={onSave} {...props} />)
  return onSave
}

describe('CardTitleField', () => {
  it('reads back the title before anything is clicked', () => {
    renderField()
    expect(screen.getByTestId('card-title-display')).toHaveTextContent('Fix the header')
    expect(screen.queryByTestId('card-title-input')).not.toBeInTheDocument()
  })

  it('turns into an editor on click', async () => {
    renderField()
    await userEvent.click(screen.getByTestId('card-title-display'))
    expect(screen.getByTestId('card-title-input')).toHaveValue('Fix the header')
  })

  it('saves on Enter', async () => {
    const onSave = renderField()
    await userEvent.click(screen.getByTestId('card-title-display'))
    const input = screen.getByTestId('card-title-input')
    await userEvent.clear(input)
    await userEvent.type(input, 'Fix the footer')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSave).toHaveBeenCalledWith('Fix the footer')
  })

  it('abandons the edit on Escape', async () => {
    const onSave = renderField()
    await userEvent.click(screen.getByTestId('card-title-display'))
    const input = screen.getByTestId('card-title-input')
    await userEvent.type(input, ' more')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByTestId('card-title-display')).toHaveTextContent('Fix the header')
  })

  it('writes nothing when the title is unchanged', async () => {
    const onSave = renderField()
    await userEvent.click(screen.getByTestId('card-title-display'))
    await userEvent.click(screen.getByTestId('card-title-save'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses to save an empty title', async () => {
    const onSave = renderField()
    await userEvent.click(screen.getByTestId('card-title-display'))
    await userEvent.clear(screen.getByTestId('card-title-input'))
    await userEvent.click(screen.getByTestId('card-title-save'))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByTestId('card-title-display')).toHaveTextContent('Fix the header')
  })

  it('cannot be edited on a closed sprint', () => {
    renderField({ readOnly: true })
    expect(screen.getByTestId('card-title-display')).toBeDisabled()
  })
})
