import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchInput } from './SearchInput'

const props = {
  placeholder: 'Search pull requests…',
  clearLabel: 'Clear search',
  onChange: vi.fn(),
}

describe('SearchInput', () => {
  it('reports what was typed', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SearchInput {...props} value="" onChange={onChange} />)

    await user.type(screen.getByPlaceholderText('Search pull requests…'), 'a')

    expect(onChange).toHaveBeenCalledWith('a')
  })

  /** Nothing to clear on an empty field, so the ✕ would be a dead control sitting over the text. */
  it('offers no clear button while the field is empty', () => {
    render(<SearchInput {...props} value="" />)
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
  })

  it('empties the field from the clear button', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SearchInput {...props} value="rebase" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(onChange).toHaveBeenCalledWith('')
  })

  /** The ✕ is an icon with no text. Every hand-rolled copy this replaced shipped it unlabelled,
   * which a screen reader announces as an unnamed button. */
  it('names the clear button for a screen reader', () => {
    render(<SearchInput {...props} value="rebase" />)
    expect(screen.getByRole('button', { name: 'Clear search' })).toHaveAccessibleName(
      'Clear search'
    )
  })

  it('takes the width its toolbar wants, and forwards a testid to the field', () => {
    const { container } = render(
      <SearchInput {...props} value="" className="max-w-sm" data-testid="global-search" />
    )

    expect(container.firstElementChild).toHaveClass('max-w-sm')
    expect(screen.getByTestId('global-search')).toBeInTheDocument()
  })
})
