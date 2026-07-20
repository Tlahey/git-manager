import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { Progress } from './progress'

describe('Progress', () => {
  it('exposes the progressbar role with aria values', () => {
    render(<Progress value={42} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('sets the fill width from the value', () => {
    render(<Progress value={30} data-testid="p" />)
    const fill = screen.getByTestId('p').firstElementChild as HTMLElement
    expect(fill.style.width).toBe('30%')
  })

  it('clamps out-of-range values to 0–100', () => {
    const { rerender } = render(<Progress value={-10} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    rerender(<Progress value={150} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('defaults to 0 when no value is given', () => {
    render(<Progress />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('has a generic accessible name by default, overridable by aria-label', () => {
    const { rerender } = render(<Progress value={10} />)
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('Progress')
    rerender(<Progress value={10} aria-label="Download" />)
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('Download')
  })

  it('drops the generic name when the caller supplies aria-labelledby', () => {
    render(
      <>
        <span id="lbl">Sync</span>
        <Progress value={10} aria-labelledby="lbl" />
      </>
    )
    const bar = screen.getByRole('progressbar')
    expect(bar).not.toHaveAttribute('aria-label')
    expect(bar).toHaveAccessibleName('Sync')
  })

  it('applies a custom indicator class and forwards the ref', () => {
    const ref = createRef<HTMLDivElement>()
    render(<Progress ref={ref} value={50} indicatorClassName="bg-success" data-testid="p" />)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
    const fill = screen.getByTestId('p').firstElementChild as HTMLElement
    expect(fill.className).toContain('bg-success')
  })
})
