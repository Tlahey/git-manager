import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotchHeaderRow } from './NotchHeaderRow'
import { NOTCH_ROW, withRule } from '../notchGeometry'
import { toneColor } from '../notchTones'

describe('NotchHeaderRow', () => {
  it('renders the eyebrow in its tone colour', () => {
    render(<NotchHeaderRow tone="error" eyebrow="PRE-COMMIT" />)
    const eyebrow = screen.getByTestId('notch-eyebrow')
    expect(eyebrow).toHaveTextContent('PRE-COMMIT')
    expect(eyebrow.style.color).toBe(toneColor('error'))
  })

  it('shows the context and the meta when they are given', () => {
    render(<NotchHeaderRow tone="info" eyebrow="NEW PR" context="Tlahey/git-manager" meta="2 min" />)
    expect(screen.getByTestId('notch-context')).toHaveTextContent('Tlahey/git-manager')
    expect(screen.getByTestId('notch-meta')).toHaveTextContent('2 min')
  })

  it('omits the optional lines entirely rather than reserving empty space', () => {
    render(<NotchHeaderRow tone="info" eyebrow="NEW PR" />)
    expect(screen.queryByTestId('notch-context')).not.toBeInTheDocument()
    expect(screen.queryByTestId('notch-meta')).not.toBeInTheDocument()
  })

  it('renders the icon it is handed', () => {
    render(<NotchHeaderRow tone="info" eyebrow="NEW PR" icon={<span>icon</span>} />)
    expect(screen.getByText('icon')).toBeInTheDocument()
  })

  it('sizes itself to the geometry, hairline included', () => {
    render(<NotchHeaderRow tone="info" eyebrow="NEW PR" />)
    expect(screen.getByTestId('notch-header-row')).toHaveStyle({
      height: `${withRule(NOTCH_ROW.header)}px`,
    })
  })
})
