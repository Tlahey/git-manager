import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { Input } from './input'

describe('Input', () => {
  it('renders a native input and accepts typed text', async () => {
    const user = userEvent.setup()
    render(<Input placeholder="Search" />)
    const input = screen.getByPlaceholderText('Search') as HTMLInputElement
    await user.type(input, 'hello')
    expect(input.value).toBe('hello')
  })

  it('forwards the type attribute', () => {
    render(<Input type="password" data-testid="input" />)
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'password')
  })

  it('calls onChange as the user types', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Input onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), 'a')
    expect(onChange).toHaveBeenCalled()
  })

  it('is disabled and unfocusable when the disabled prop is set', () => {
    render(<Input disabled data-testid="input" />)
    expect(screen.getByTestId('input')).toBeDisabled()
  })

  it('merges a custom className', () => {
    render(<Input className="extra-class" data-testid="input" />)
    expect(screen.getByTestId('input').className).toContain('extra-class')
  })

  it('forwards the ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Input ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })
})
