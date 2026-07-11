import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { ToolbarSearch } from './ToolbarSearch'

describe('ToolbarSearch', () => {
  it('renders the current value and calls onChange as the user types', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ToolbarSearch value="" onChange={onChange} />)
    await user.type(screen.getByPlaceholderText('toolbar.search'), 'a')
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('does not show the clear button when the value is empty', () => {
    render(<ToolbarSearch value="" onChange={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows a clear button that resets the value when the value is non-empty', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ToolbarSearch value="feature" onChange={onChange} />)
    const clearButton = screen.getByRole('button', { name: 'toolbar.cancel' })
    await user.click(clearButton)
    expect(onChange).toHaveBeenCalledWith('')
  })
})
