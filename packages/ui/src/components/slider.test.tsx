import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Slider } from './slider'

function renderSlider(props: Partial<React.ComponentProps<typeof Slider>> = {}) {
  const onValueChange = vi.fn()
  render(<Slider aria-label="Transparency" value={50} onValueChange={onValueChange} {...props} />)
  return { slider: screen.getByRole('slider'), onValueChange }
}

describe('Slider', () => {
  it('exposes the native slider role and its value range to assistive tech', () => {
    const { slider } = renderSlider({ value: 30, min: 0, max: 200 })
    expect(slider).toHaveAttribute('aria-label', 'Transparency')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '200')
    expect(slider).toHaveValue('30')
  })

  it('reports the new value as a number, not a string', () => {
    const { slider, onValueChange } = renderSlider()
    fireEvent.change(slider, { target: { value: '75' } })
    expect(onValueChange).toHaveBeenCalledWith(75)
    expect(onValueChange.mock.calls[0][0]).toBeTypeOf('number')
  })

  it('honours a custom step', () => {
    const { slider } = renderSlider({ step: 25 })
    expect(slider).toHaveAttribute('step', '25')
  })

  // Driven through userEvent rather than fireEvent: fireEvent.change dispatches the
  // event straight at the node and so fires on a disabled input, which no real browser
  // does — it would pass regardless of whether `disabled` was wired up at all.
  it('cannot be operated while disabled', async () => {
    const user = userEvent.setup()
    const { slider, onValueChange } = renderSlider({ disabled: true })
    expect(slider).toBeDisabled()
    await user.click(slider)
    await user.keyboard('{ArrowRight}')
    expect(onValueChange).not.toHaveBeenCalled()
  })

  // NB: keyboard stepping (arrows / Home / End / PageUp / PageDown) is not covered
  // here — jsdom does not implement it for input[type=range]. It comes from the native
  // element rather than from this file, which is the main reason the component is built
  // on one; a div-based slider would owe a real test for each of those keys.

  // The filled portion of the track is a gradient stop, not a separate element, so a
  // wrong percentage is invisible in the DOM tree but very visible on screen.
  it('fills the track up to the current value', () => {
    const { slider } = renderSlider({ value: 25, min: 0, max: 100 })
    expect(slider.getAttribute('style')).toContain('25%')
  })

  it('maps the fill onto a range that does not start at zero', () => {
    const { slider } = renderSlider({ value: 150, min: 100, max: 200 })
    expect(slider.getAttribute('style')).toContain('50%')
  })

  // min === max would divide by zero and leave the gradient stop as NaN, which drops
  // the fill entirely at every value.
  it('does not produce NaN when the range has zero width', () => {
    const { slider } = renderSlider({ value: 5, min: 5, max: 5 })
    expect(slider.getAttribute('style')).not.toContain('NaN')
  })

  it('forwards extra props and merges the className', () => {
    render(
      <Slider
        aria-label="Transparency"
        value={10}
        onValueChange={vi.fn()}
        className="custom-class"
        data-testid="my-slider"
      />
    )
    const slider = screen.getByTestId('my-slider')
    expect(slider.className).toContain('custom-class')
  })
})
