import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TerminalStateIcon } from './TerminalStateIcon'

describe('TerminalStateIcon', () => {
  it('breathes on the warning tone while a command runs', () => {
    render(<TerminalStateIcon busy data-testid="chip" />)
    const chip = screen.getByTestId('chip')
    expect(chip).toHaveAttribute('data-state', 'busy')
    expect(chip.className).toContain('animate-pulse')
    expect(chip.className).toContain('text-tone-warning')
  })

  it('settles onto a still green chip once the prompt is back', () => {
    render(<TerminalStateIcon busy={false} data-testid="chip" />)
    const chip = screen.getByTestId('chip')
    expect(chip).toHaveAttribute('data-state', 'idle')
    expect(chip.className).not.toContain('animate-pulse')
    // `Tag`'s success tone — a green fill with a contrast-checked foreground, not a raw shade.
    expect(chip.className).toContain('bg-success/15')
    expect(chip.className).toContain('text-tone-success')
  })

  it('shows the running command when it is given one', () => {
    render(<TerminalStateIcon busy label="claude" data-testid="chip" />)
    expect(screen.getByTestId('chip')).toHaveTextContent('claude')
  })

  it('stays a bare glyph without a label', () => {
    render(<TerminalStateIcon busy={false} data-testid="chip" />)
    expect(screen.getByTestId('chip')).toHaveTextContent('')
  })
})
