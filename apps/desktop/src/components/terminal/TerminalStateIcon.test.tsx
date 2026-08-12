import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TerminalStateIcon } from './TerminalStateIcon'

describe('TerminalStateIcon', () => {
  it('sits quiet and grey when there is nothing to report', () => {
    render(<TerminalStateIcon state="idle" data-testid="chip" />)
    const chip = screen.getByTestId('chip')
    expect(chip).toHaveAttribute('data-state', 'idle')
    expect(chip.className).toContain('bg-muted')
    expect(chip.className).not.toContain('animate-pulse')
  })

  it('breathes, still grey, while a command runs', () => {
    render(<TerminalStateIcon state="busy" data-testid="chip" />)
    const chip = screen.getByTestId('chip')
    expect(chip).toHaveAttribute('data-state', 'busy')
    expect(chip.className).toContain('bg-muted')
    expect(chip.className).toContain('animate-pulse')
  })

  it('turns blue and stops moving once a command has finished unseen', () => {
    render(<TerminalStateIcon state="done" data-testid="chip" />)
    const chip = screen.getByTestId('chip')
    expect(chip).toHaveAttribute('data-state', 'done')
    // `Tag`'s info tone — a blue fill with a contrast-checked foreground, not a raw shade.
    expect(chip.className).toContain('bg-blue-500/15')
    expect(chip.className).toContain('text-tone-info')
    expect(chip.className).not.toContain('animate-pulse')
  })

  it('shows the command when it is given one', () => {
    render(<TerminalStateIcon state="busy" label="claude" data-testid="chip" />)
    expect(screen.getByTestId('chip')).toHaveTextContent('claude')
  })

  it('stays a bare glyph without a label', () => {
    render(<TerminalStateIcon state="idle" data-testid="chip" />)
    expect(screen.getByTestId('chip')).toHaveTextContent('')
  })
})
