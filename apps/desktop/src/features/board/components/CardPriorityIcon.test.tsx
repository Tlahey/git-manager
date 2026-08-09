import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardPriorityIcon } from './CardPriorityIcon'

describe('CardPriorityIcon', () => {
  it('spells the priority out beside the glyph when asked, and names it either way', () => {
    const { rerender } = render(<CardPriorityIcon priority="high" />)
    expect(screen.getByTestId('card-priority-high')).toHaveAccessibleName('High')
    expect(screen.getByTestId('card-priority-high')).not.toHaveTextContent('High')

    rerender(<CardPriorityIcon priority="high" withLabel />)
    expect(screen.getByTestId('card-priority-high')).toHaveTextContent('High')
  })

  /**
   * The panel row and the list of values it opens are the same row — `CardChoiceList` sets its
   * mark and its name `gap-2` apart, and a value drawn tighter than the choices underneath makes
   * the picker read as a different control from the field it belongs to.
   */
  it('spaces the label from the glyph the way the choices below it are spaced', () => {
    const { rerender } = render(<CardPriorityIcon priority="normal" withLabel />)
    expect(screen.getByTestId('card-priority-normal').className).toContain('gap-2')

    // Unlabelled it rides a card face among other small marks, where that gap is dead space.
    rerender(<CardPriorityIcon priority="normal" />)
    expect(screen.getByTestId('card-priority-normal').className).not.toContain('gap-2')
  })

  /**
   * Two theme-token answers were tried and left this mark invisible: `--destructive` is a *fill*
   * colour, a near-black maroon on the dark themes, and the `--tone-*` inks are graded for small
   * text on a tinted chip, which on a dark surface means pale. A priority is hunted for down a whole
   * column, so it carries a fixed vivid hue like the kind tiles do. Normal keeps the muted ink: it
   * is the value nearly every card holds.
   */
  it('draws high as a real red and low as a real blue, in every theme', () => {
    const glyph = (priority: 'high' | 'normal' | 'low') => {
      const { unmount } = render(<CardPriorityIcon priority={priority} />)
      const className = screen
        .getByTestId(`card-priority-${priority}`)
        .querySelector('svg')!
        .getAttribute('class')
      unmount()
      return className ?? ''
    }

    expect(glyph('high')).toContain('text-red-500')
    expect(glyph('low')).toContain('text-blue-500')
    expect(glyph('normal')).toContain('text-muted-foreground')
  })
})
