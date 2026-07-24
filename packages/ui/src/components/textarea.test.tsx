import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { Textarea } from './textarea'

describe('Textarea', () => {
  it('renders a native textarea and accepts typed text', async () => {
    const user = userEvent.setup()
    render(<Textarea placeholder="Notes" />)
    const textarea = screen.getByPlaceholderText('Notes') as HTMLTextAreaElement
    await user.type(textarea, 'hello world')
    expect(textarea.value).toBe('hello world')
  })

  it('calls onChange as the user types', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Textarea onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), 'a')
    expect(onChange).toHaveBeenCalled()
  })

  it('is disabled when the disabled prop is set', () => {
    render(<Textarea disabled data-testid="textarea" />)
    expect(screen.getByTestId('textarea')).toBeDisabled()
  })

  it('merges a custom className', () => {
    render(<Textarea className="extra-class" data-testid="textarea" />)
    expect(screen.getByTestId('textarea').className).toContain('extra-class')
  })

  it('forwards the ref to the underlying textarea element', () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<Textarea ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement)
  })

  it('disables autoCapitalize, autoCorrect, and spellCheck by default', () => {
    render(<Textarea data-testid="textarea" />)
    const el = screen.getByTestId('textarea')
    expect(el).toHaveAttribute('autocapitalize', 'off')
    expect(el).toHaveAttribute('autocorrect', 'off')
    expect(el.getAttribute('spellcheck')).toBe('false')
  })

  it('allows overriding autoCapitalize, autoCorrect, and spellCheck props', () => {
    render(<Textarea data-testid="textarea" autoCapitalize="on" autoCorrect="on" spellCheck={true} />)
    const el = screen.getByTestId('textarea')
    expect(el).toHaveAttribute('autocapitalize', 'on')
    expect(el).toHaveAttribute('autocorrect', 'on')
    expect(el.getAttribute('spellcheck')).toBe('true')
  })
})
