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

  it('applies the chrome variant tokens with a full-opacity placeholder', () => {
    // The field fill is sidebar-accent, so text + placeholder ride sidebar-accent-
    // foreground — the AA-graded pair for that fill (sidebar-foreground washed out on
    // light/saturated accents like nord/platinum). Full opacity, not a faint /60.
    render(<Input variant="chrome" data-testid="input" placeholder="Filtrer" />)
    const el = screen.getByTestId('input')
    expect(el.className).toContain('bg-sidebar-accent')
    expect(el.className).toContain('placeholder:text-sidebar-accent-foreground')
    expect(el.className).not.toMatch(/placeholder:text-sidebar-accent-foreground\/\d/)
  })

  it('defaults to the md size (36px field, text-sm, with shadow)', () => {
    render(<Input data-testid="input" />)
    const el = screen.getByTestId('input')
    expect(el.className).toContain('h-9')
    expect(el.className).toContain('text-sm')
    expect(el.className).toContain('shadow-sm')
  })

  it('applies the sm size (compact 28px field, text-xs, no shadow)', () => {
    render(<Input inputSize="sm" data-testid="input" />)
    const el = screen.getByTestId('input')
    expect(el.className).toContain('h-7')
    expect(el.className).toContain('text-xs')
    expect(el.className).not.toContain('h-9')
    expect(el.className).not.toContain('shadow-sm')
  })

  it('renders start/end icon slots and pads the field for them', () => {
    render(
      <Input
        data-testid="input"
        startIcon={<span data-testid="start-icon" />}
        endIcon={<button data-testid="end-icon" />}
      />
    )
    expect(screen.getByTestId('start-icon')).toBeInTheDocument()
    expect(screen.getByTestId('end-icon')).toBeInTheDocument()
    const el = screen.getByTestId('input')
    expect(el.className).toContain('pl-8')
    expect(el.className).toContain('pr-8')
  })

  it('disables autoCapitalize, autoCorrect, and spellCheck by default', () => {
    render(<Input data-testid="input" />)
    const el = screen.getByTestId('input')
    expect(el).toHaveAttribute('autocapitalize', 'off')
    expect(el).toHaveAttribute('autocorrect', 'off')
    expect(el.getAttribute('spellcheck')).toBe('false')
  })

  it('allows overriding autoCapitalize, autoCorrect, and spellCheck props', () => {
    render(<Input data-testid="input" autoCapitalize="on" autoCorrect="on" spellCheck={true} />)
    const el = screen.getByTestId('input')
    expect(el).toHaveAttribute('autocapitalize', 'on')
    expect(el).toHaveAttribute('autocorrect', 'on')
    expect(el.getAttribute('spellcheck')).toBe('true')
  })
})
