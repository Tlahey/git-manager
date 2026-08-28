import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitFileListSearchBar } from './CommitFileListSearchBar'

describe('CommitFileListSearchBar', () => {
  it('renders the current value and reports every change', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CommitFileListSearchBar value="" onChange={onChange} />)

    await user.type(screen.getByPlaceholderText('Filter files...'), 'foo')
    expect(onChange).toHaveBeenCalledWith('f')
    expect(onChange).toHaveBeenCalledWith('o')
  })

  it('shows the clear button only when there is a value, and clears on click', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<CommitFileListSearchBar value="" onChange={onChange} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    rerender(<CommitFileListSearchBar value="foo" onChange={onChange} />)
    await user.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
