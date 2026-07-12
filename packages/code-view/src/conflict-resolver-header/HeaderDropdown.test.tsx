import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HeaderDropdown } from './HeaderDropdown'

const whitespaceLabels = {
  compare: 'Do not ignore',
  ignore: 'Ignore whitespace',
  trim: 'Ignore leading/trailing whitespace',
} as const

function renderDropdown(
  overrides: Partial<Parameters<typeof HeaderDropdown<'compare' | 'ignore' | 'trim'>>[0]> = {}
) {
  const onChange = vi.fn()
  render(
    <HeaderDropdown
      options={['compare', 'ignore', 'trim'] as const}
      value="compare"
      onChange={onChange}
      labels={whitespaceLabels}
      menuWidthClass="w-52"
      testId="merge-whitespace-dropdown-btn"
      {...overrides}
    />
  )
  return { onChange }
}

describe('HeaderDropdown', () => {
  it('shows the selected option’s label on the trigger and hides the menu until clicked', () => {
    renderDropdown()
    expect(screen.getByTestId('merge-whitespace-dropdown-btn')).toHaveTextContent('Do not ignore')
    expect(screen.queryByText('Ignore whitespace')).not.toBeInTheDocument()
  })

  it('opens the menu with every option and fires onChange (then closes) on selection', async () => {
    const user = userEvent.setup()
    const { onChange } = renderDropdown()

    await user.click(screen.getByTestId('merge-whitespace-dropdown-btn'))
    expect(screen.getByText('Ignore whitespace')).toBeInTheDocument()
    expect(screen.getByText('Ignore leading/trailing whitespace')).toBeInTheDocument()

    await user.click(screen.getByText('Ignore whitespace'))
    expect(onChange).toHaveBeenCalledWith('ignore')
    expect(screen.queryByText('Ignore leading/trailing whitespace')).not.toBeInTheDocument()
  })

  it('accents the currently-selected option in the open menu', async () => {
    const user = userEvent.setup()
    renderDropdown({ value: 'ignore' })

    await user.click(screen.getByTestId('merge-whitespace-dropdown-btn'))
    // The trigger also renders the selected label, so scope to the menu items (`w-full`).
    const menuItem = (name: string) =>
      screen.getAllByRole('button', { name }).find((el) => el.className.includes('w-full'))!
    expect(menuItem('Ignore whitespace')).toHaveClass('font-semibold')
    expect(menuItem('Do not ignore')).not.toHaveClass('font-semibold')
  })

  it('closes on an outside mousedown without selecting anything', async () => {
    const user = userEvent.setup()
    const { onChange } = renderDropdown()

    await user.click(screen.getByTestId('merge-whitespace-dropdown-btn'))
    expect(screen.getByText('Ignore whitespace')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Ignore whitespace')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
