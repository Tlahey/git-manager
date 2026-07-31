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

  it('renders whatever the band slivers were given', () => {
    render(
      <NotchCard tone="info" visible bandStart={<span>Git Manager</span>} bandEnd={<button>×</button>}>
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

  it('fades the card and stops the halo pulsing while hidden', () => {
    const { rerender } = render(
      <NotchCard tone="success" visible>
        <div />
      </NotchCard>
    )
    expect(screen.getByTestId('notch-halo').style.opacity).toBe('1')
    expect(screen.getByTestId('notch-card').className).toContain('opacity-100')

    rerender(
      <NotchCard tone="success" visible={false}>
        <div />
      </NotchCard>
    )
    const halo = screen.getByTestId('notch-halo')
    expect(halo.style.opacity).toBe('0')
    // An invisible card that keeps animating its shadow is work nobody can see.
    expect(halo.style.animation).toBe('')
    expect(screen.getByTestId('notch-card').className).toContain('opacity-0')
  })

  it('activates on a click anywhere on the card', async () => {
    const onActivate = vi.fn()
    render(
      <NotchCard tone="info" visible onActivate={onActivate}>
        <div>body</div>
      </NotchCard>
    )
    await userEvent.click(screen.getByText('body'))
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('only looks clickable when it is', () => {
    const { rerender } = render(
      <NotchCard tone="info" visible>
        <div />
      </NotchCard>
    )
    expect(screen.getByTestId('notch-card').className).not.toContain('cursor-pointer')

    rerender(
      <NotchCard tone="info" visible onActivate={() => {}}>
        <div />
      </NotchCard>
    )
    expect(screen.getByTestId('notch-card').className).toContain('cursor-pointer')
  })

  it('reports pointer enter and leave, for hover-to-pause', async () => {
    const onPointerEnter = vi.fn()
    const onPointerLeave = vi.fn()
    render(
      <NotchCard tone="info" visible onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
        <div>body</div>
      </NotchCard>
    )
    await userEvent.hover(screen.getByTestId('notch-card'))
    await userEvent.unhover(screen.getByTestId('notch-card'))
    expect(onPointerEnter).toHaveBeenCalled()
    expect(onPointerLeave).toHaveBeenCalled()
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
