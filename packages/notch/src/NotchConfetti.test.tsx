import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotchConfetti } from './NotchConfetti'
import { CONFETTI_PIECE_COUNT, createConfettiPieces } from './confetti'
import { NOTCH_CARD_WIDTH, rewardConfettiOrigin } from './notchGeometry'
import { NOTCH_TIER_CONFETTI } from './notchRewardTiers'

const props = { tier: 'gold', seed: 'reward-merge-master', height: 191 } as const


describe('NotchConfetti', () => {
  it('renders one sprite per piece of the burst', () => {
    render(<NotchConfetti {...props} />)
    expect(screen.getAllByTestId('notch-confetti-piece')).toHaveLength(CONFETTI_PIECE_COUNT)
  })

  it('stays out of the accessibility tree and out of the way of the pointer', () => {
    // Decorative by definition, and covering the whole card: a layer that took clicks would swallow
    // the card's own activate.
    render(<NotchConfetti {...props} />)
    const layer = screen.getByTestId('notch-confetti')
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer.className).toContain('pointer-events-none')
  })

  it('clips itself to the card, because the window has nowhere else to put the paper', () => {
    // The OS window is the card plus a 26pt halo margin. Widening it so confetti could spill onto
    // the wallpaper would drop a bigger always-on-top transparent rectangle over the menu bar and
    // swallow clicks that land in it.
    render(<NotchConfetti {...props} />)
    const layer = screen.getByTestId('notch-confetti')
    expect(layer.className).toContain('overflow-hidden')
    expect(layer).toHaveStyle({ width: `${NOTCH_CARD_WIDTH}px`, height: '191px' })
  })

  it('hands each sprite its own flight as custom properties', () => {
    render(<NotchConfetti {...props} count={1} />)
    const [expected] = createConfettiPieces({
      seed: props.seed,
      colors: NOTCH_TIER_CONFETTI.gold,
      origin: rewardConfettiOrigin(),
      height: props.height,
      count: 1,
    })
    const sprite = screen.getByTestId('notch-confetti-piece')
    expect(sprite.style.getPropertyValue('--nc-drift')).toBe(`${expected.driftX.toFixed(1)}px`)
    expect(sprite.style.getPropertyValue('--nc-apex')).toBe(`${expected.apexY.toFixed(1)}px`)
    expect(sprite.style.getPropertyValue('--nc-fall')).toBe(`${expected.fallY.toFixed(1)}px`)
    expect(sprite.style.getPropertyValue('--nc-duration')).toBe(`${expected.durationMs}ms`)
    expect(sprite.style.getPropertyValue('--nc-delay')).toBe(`${expected.delayMs}ms`)
  })

  it('centres a sprite on its launch point rather than hanging it from a corner', () => {
    render(<NotchConfetti {...props} count={1} />)
    const [piece] = createConfettiPieces({
      seed: props.seed,
      colors: NOTCH_TIER_CONFETTI.gold,
      origin: rewardConfettiOrigin(),
      height: props.height,
      count: 1,
    })
    const sprite = screen.getByTestId('notch-confetti-piece')
    // Compared numerically rather than via toHaveStyle's string match: jsdom rounds the serialized
    // px value to fewer significant digits than the raw JS float.
    expect(parseFloat(sprite.style.left)).toBeCloseTo(piece.x - piece.width / 2, 2)
    expect(parseFloat(sprite.style.top)).toBeCloseTo(piece.y - piece.height / 2, 2)
  })

  it('splits the drift, the arc and the tumble across three elements', () => {
    // All three are `transform`; on one element the last declaration would win and two thirds of the
    // motion would silently disappear.
    render(<NotchConfetti {...props} count={1} />)
    const sprite = screen.getByTestId('notch-confetti-piece')
    expect(sprite.className).toContain('notch-confetti-drift')
    const rise = sprite.firstElementChild as HTMLElement
    expect(rise.className).toContain('notch-confetti-rise')
    expect((rise.firstElementChild as HTMLElement).className).toContain('notch-confetti-spin')
  })

  it('cuts the paper in the tier it was handed', () => {
    render(<NotchConfetti {...props} tier="platinum" count={4} />)
    for (const sprite of screen.getAllByTestId('notch-confetti-piece')) {
      const paper = sprite.firstElementChild!.firstElementChild as HTMLElement
      expect(paper.style.backgroundColor).not.toBe('')
    }
  })

  it('throws nothing at all when the user asked for reduced motion', () => {
    // Not a slower burst, and not pieces frozen in place — those read as debris left on the card.
    // The medal, the tier-coloured halo and the eyebrow still say what was unlocked.
    render(<NotchConfetti {...props} reducedMotion />)
    expect(screen.queryByTestId('notch-confetti')).not.toBeInTheDocument()
  })

  it('reads the system setting when the caller does not override it', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    )
    render(<NotchConfetti {...props} />)
    expect(screen.queryByTestId('notch-confetti')).not.toBeInTheDocument()
  })

  it('celebrates anyway when the caller explicitly says to', () => {
    // What the story's toggle needs: the un-reduced card has to be reviewable on a machine that is
    // set to reduce motion, and the reduced one on a machine that is not.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    )
    render(<NotchConfetti {...props} reducedMotion={false} />)
    expect(screen.getByTestId('notch-confetti')).toBeInTheDocument()
  })
})
