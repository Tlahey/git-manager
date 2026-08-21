import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotchCard } from './NotchCard'
import { NOTCH_ROW, withRule } from './notchGeometry'
import { NOTCH_TONE_RGB } from './notchTones'

describe('NotchCard', () => {
  it('reserves the band at exactly the height the geometry accounts for', () => {
    // The band is the safe area behind the camera housing plus its hairline. If it renders shorter
    // than the geometry says, every row below it shifts up under the notch.
    render(
      <NotchCard tone="info" visible>
        <div />
      </NotchCard>
    )
    expect(screen.getByTestId('notch-band')).toHaveStyle({
      height: `${withRule(NOTCH_ROW.band)}px`,
    })
  })

  it('caps both band slivers so their content cannot run under the housing', () => {
    render(
      <NotchCard tone="info" visible bandStart={<span>left</span>} bandEnd={<span>right</span>}>
        <div />
      </NotchCard>
    )
    const band = screen.getByTestId('notch-band')
    for (const slot of Array.from(band.children) as HTMLElement[]) {
      expect(slot.style.maxWidth).toBe('100px')
    }
  })

  it('takes a real per-machine housing half-width instead of the default guess', () => {
    // What `get_notch_metrics` feeds in once it has actually asked `NSScreen`.
    render(
      <NotchCard
        tone="info"
        visible
        housingHalfWidth={110}
        bandStart={<span>left</span>}
        bandEnd={<span>right</span>}
      >
        <div />
      </NotchCard>
    )
    const band = screen.getByTestId('notch-band')
    for (const slot of Array.from(band.children) as HTMLElement[]) {
      expect(slot.style.maxWidth).not.toBe('100px')
    }
  })

  it('takes a real per-machine band height instead of NOTCH_ROW.band', () => {
    render(
      <NotchCard tone="info" visible bandHeight={38}>
        <div />
      </NotchCard>
    )
    expect(screen.getByTestId('notch-band')).toHaveStyle({ height: `${withRule(38)}px` })
  })

  it('renders whatever the band slivers were given', () => {
    render(
      <NotchCard
        tone="info"
        visible
        bandStart={<span>Git Manager</span>}
        bandEnd={<button>×</button>}
      >
        <div />
      </NotchCard>
    )
    expect(screen.getByText('Git Manager')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '×' })).toBeInTheDocument()
  })

  it('hands the halo its tone as a custom property, so the keyframe can vary its alpha', () => {
    render(
      <NotchCard tone="error" visible>
        <div />
      </NotchCard>
    )
    const halo = screen.getByTestId('notch-halo')
    expect(halo.style.getPropertyValue('--notch-tone-rgb')).toBe(NOTCH_TONE_RGB.error)
  })

  // Only the contents fade. Fading the shell as well is what made a real slide read as the card
  // being switched off: it went transparent before it had visibly moved, so the two cancelled out.
  it('fades its contents while leaving the shell solid', () => {
    const { rerender } = render(
      <NotchCard tone="success" visible>
        <div />
      </NotchCard>
    )
    expect(screen.getByTestId('notch-content').style.opacity).toBe('1')

    rerender(
      <NotchCard tone="success" visible={false}>
        <div />
      </NotchCard>
    )
    expect(screen.getByTestId('notch-content').style.opacity).toBe('0')
    // The shell carries no opacity of its own, in either state — it slides, and that is all.
    const card = screen.getByTestId('notch-card')
    expect(card.className).not.toContain('opacity-')
    expect(card.style.opacity).toBe('')
  })

  it('keeps the halo glowing throughout, since it travels with the shell', () => {
    const { rerender } = render(
      <NotchCard tone="success" visible>
        <div />
      </NotchCard>
    )
    expect(screen.getByTestId('notch-halo').style.animation).not.toBe('')

    rerender(
      <NotchCard tone="success" visible={false}>
        <div />
      </NotchCard>
    )
    const halo = screen.getByTestId('notch-halo')
    expect(halo.style.opacity).toBe('')
    expect(halo.style.animation).not.toBe('')
  })

  it('does nothing on a click anywhere on the card body', async () => {
    // See issue #413: only the close button and the action row's explicit buttons respond to a
    // click. A plain body click used to also dismiss the card, which read as surprising.
    render(
      <NotchCard tone="info" visible>
        <div>body</div>
      </NotchCard>
    )
    expect(screen.getByTestId('notch-card').className).not.toContain('cursor-pointer')
    await userEvent.click(screen.getByText('body'))
    // Nothing to assert beyond "it didn't throw" — the shell takes no onClick at all.
  })

  it('reports pointer enter and leave, for hover-to-pause', async () => {
    const onPointerEnter = vi.fn()
    const onPointerLeave = vi.fn()
    render(
      <NotchCard
        tone="info"
        visible
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <div>body</div>
      </NotchCard>
    )
    await userEvent.hover(screen.getByTestId('notch-card'))
    await userEvent.unhover(screen.getByTestId('notch-card'))
    expect(onPointerEnter).toHaveBeenCalled()
    expect(onPointerLeave).toHaveBeenCalled()
  })

  it('lets one card override the halo colour its tone would have given it', () => {
    // The reward card glows in its medal's colour, and "gold" is not something the seven tones can
    // say. Everything else leaves this alone.
    render(
      <NotchCard tone="highlight" visible haloRgb="255, 215, 0">
        <div />
      </NotchCard>
    )
    const halo = screen.getByTestId('notch-halo')
    expect(halo.style.getPropertyValue('--notch-tone-rgb')).toBe('255, 215, 0')
    expect(halo.style.getPropertyValue('--notch-tone-rgb')).not.toBe(NOTCH_TONE_RGB.highlight)
  })

  it('paints the backdrop behind the rows, so nothing flies over a title', () => {
    render(
      <NotchCard tone="highlight" visible backdrop={<div data-testid="paper" />}>
        <div>body</div>
      </NotchCard>
    )
    const shell = screen.getByTestId('notch-card')
    const [first, second] = Array.from(shell.children)
    expect(first).toBe(screen.getByTestId('paper'))
    expect(second).toBe(screen.getByTestId('notch-content'))
  })

  it('keeps the backdrop out of the contents’ fade, the way the halo is', () => {
    // The celebration belongs to the shell: it times itself against the card's arrival and fades on
    // its own, rather than being switched off with the rows.
    render(
      <NotchCard tone="highlight" visible={false} backdrop={<div data-testid="paper" />}>
        <div>body</div>
      </NotchCard>
    )
    expect(screen.getByTestId('notch-content')).not.toContainElement(screen.getByTestId('paper'))
  })

  it('keeps the halo out of the accessibility tree', () => {
    render(
      <NotchCard tone="info" visible>
        <div />
      </NotchCard>
    )
    expect(screen.getByTestId('notch-halo')).toHaveAttribute('aria-hidden', 'true')
  })
})
