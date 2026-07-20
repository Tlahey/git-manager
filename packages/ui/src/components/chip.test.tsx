import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Chip } from './chip'

describe('Chip', () => {
  it('renders its children', () => {
    render(<Chip>En cours</Chip>)
    expect(screen.getByText('En cours')).toBeInTheDocument()
  })

  it('rides the accessible button tokens when active (not ad-hoc bg-primary)', () => {
    // Regression for the Twilight trophy filters: the active pill must use the
    // graded button component tokens, which carry Twilight's light-violet override,
    // instead of near-black text on saturated bg-primary.
    render(
      <Chip active data-testid="chip">
        Terminés
      </Chip>
    )
    const chip = screen.getByTestId('chip')
    expect(chip.className).toContain('bg-button')
    expect(chip.className).toContain('text-button-foreground')
    expect(chip.className).not.toContain('bg-primary')
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  it('uses the outline, unpressed styling when inactive', () => {
    render(
      <Chip data-testid="chip">
        Tous
      </Chip>
    )
    const chip = screen.getByTestId('chip')
    // Inactive inherits the surface foreground (full contrast, APCA Bronze) instead of
    // the muted token, which only reached ~53Lc at 10px/600 — see chip.tsx.
    expect(chip.className).toContain('text-inherit')
    expect(chip.className).not.toContain('text-muted-foreground')
    expect(chip.className).not.toContain('bg-button')
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('fires onClick', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Chip onClick={onClick}>Tous</Chip>)
    await user.click(screen.getByText('Tous'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('merges a custom className', () => {
    render(
      <Chip data-testid="chip" className="extra-class">
        Tous
      </Chip>
    )
    expect(screen.getByTestId('chip').className).toContain('extra-class')
  })
})
