import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import { Avatar } from './avatar'

describe('Avatar', () => {
  it('renders the image when a src is given', () => {
    render(<Avatar src="https://example.com/a.png" alt="Ada Lovelace" fallback="AL" />)
    const img = screen.getByRole('img', { name: 'Ada Lovelace' }) as HTMLImageElement
    expect(img.src).toContain('a.png')
  })

  it('renders the fallback when no src is given', () => {
    render(<Avatar alt="Ada Lovelace" fallback="AL" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('falls back to initials when the image fails to load', () => {
    render(<Avatar src="https://example.com/broken.png" alt="Ada Lovelace" fallback="AL" />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('applies pixel sizing and a proportional font size', () => {
    render(<Avatar alt="x" fallback="AL" size={20} data-testid="av" />)
    const el = screen.getByTestId('av')
    expect(el.style.width).toBe('20px')
    expect(el.style.height).toBe('20px')
    expect(el.style.fontSize).toBe('8px')
  })

  it('renders a square when requested, else a circle', () => {
    const { rerender } = render(<Avatar alt="x" fallback="AL" data-testid="av" />)
    expect(screen.getByTestId('av').className).toContain('rounded-full')
    rerender(<Avatar alt="x" fallback="AL" square data-testid="av" />)
    expect(screen.getByTestId('av').className).toContain('rounded-none')
  })

  it('titles itself with the alt name and forwards the ref', () => {
    const ref = createRef<HTMLDivElement>()
    render(<Avatar ref={ref} alt="Ada" fallback="A" data-testid="av" />)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
    expect(screen.getByTestId('av')).toHaveAttribute('title', 'Ada')
  })
})
