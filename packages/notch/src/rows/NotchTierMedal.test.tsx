import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotchTierMedal } from './NotchTierMedal'
import { NOTCH_REWARD_MEDAL_SIZE } from '../notchGeometry'
import { tierColor } from '../notchRewardTiers'

describe('NotchTierMedal', () => {
  it('renders at the size the confetti’s origin is computed from', () => {
    // `rewardConfettiOrigin` places the burst at this disc's centre; a medal drawn at another size
    // would have paper coming out beside it.
    render(<NotchTierMedal tier="gold" />)
    expect(screen.getByTestId('notch-tier-medal')).toHaveStyle({
      width: `${NOTCH_REWARD_MEDAL_SIZE}px`,
      height: `${NOTCH_REWARD_MEDAL_SIZE}px`,
    })
  })

  it('takes its colour from the tier', () => {
    render(<NotchTierMedal tier="bronze" />)
    const medal = screen.getByTestId('notch-tier-medal')
    expect(medal.style.color).toBe(tierColor('bronze'))
    expect(medal).toHaveAttribute('data-tier', 'bronze')
  })

  it('wears the same glyph at every tier, and only changes colour', () => {
    const { rerender } = render(<NotchTierMedal tier="silver" />)
    const glyph = () => screen.getByTestId('notch-tier-medal').querySelector('svg')?.outerHTML
    const silver = glyph()
    rerender(<NotchTierMedal tier="platinum" />)
    // Four different shapes would turn one ranked scale into four unrelated icons.
    expect(glyph()).toBe(silver)
    expect(screen.getByTestId('notch-tier-medal').style.color).toBe(tierColor('platinum'))
  })

  it('is decorative — a medal cannot say “gold” to a screen reader', () => {
    // Which is why the tier belongs in the card's eyebrow, as a translated string.
    render(<NotchTierMedal tier="gold" />)
    expect(screen.getByTestId('notch-tier-medal')).toHaveAttribute('aria-hidden', 'true')
  })

  it('honours a size override without moving its glyph off centre', () => {
    render(<NotchTierMedal tier="gold" size={48} />)
    const medal = screen.getByTestId('notch-tier-medal')
    expect(medal).toHaveStyle({ width: '48px', height: '48px' })
    expect(medal.className).toContain('items-center')
    expect(medal.className).toContain('justify-center')
  })
})
