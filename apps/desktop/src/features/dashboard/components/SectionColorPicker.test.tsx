import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionColorPicker } from './SectionColorPicker'
import { SECTION_COLOR_HEADER } from '../lib/sectionColor.config'
import { SECTION_COLORS } from '../stores/dashboard.store'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SectionColorPicker', () => {
  it('offers every palette colour plus a "no colour" choice', () => {
    render(<SectionColorPicker sectionId="open" value={null} onChange={vi.fn()} />)
    expect(screen.getByTestId('dashboard-color-open-none')).toBeInTheDocument()
    for (const color of SECTION_COLORS) {
      expect(screen.getByTestId(`dashboard-color-open-${color}`)).toBeInTheDocument()
    }
  })

  it('marks the current colour as pressed', () => {
    render(<SectionColorPicker sectionId="open" value="emerald" onChange={vi.fn()} />)
    expect(screen.getByTestId('dashboard-color-open-emerald')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByTestId('dashboard-color-open-rose')).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks "no colour" as pressed when there is none', () => {
    render(<SectionColorPicker sectionId="open" value={null} onChange={vi.fn()} />)
    expect(screen.getByTestId('dashboard-color-open-none')).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports the picked colour', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SectionColorPicker sectionId="open" value={null} onChange={onChange} />)
    await user.click(screen.getByTestId('dashboard-color-open-sky'))
    expect(onChange).toHaveBeenCalledWith('sky')
  })

  it('reports null when the colour is cleared', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SectionColorPicker sectionId="open" value="sky" onChange={onChange} />)
    await user.click(screen.getByTestId('dashboard-color-open-none'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('gives every swatch an accessible name', () => {
    render(<SectionColorPicker sectionId="open" value={null} onChange={vi.fn()} />)
    expect(screen.getByTestId('dashboard-color-open-emerald')).toHaveAccessibleName('Green')
    expect(screen.getByTestId('dashboard-color-open-none')).toHaveAccessibleName('No color')
  })

  it('maps every palette colour to a header style, so none can render untinted', () => {
    for (const color of SECTION_COLORS) {
      expect(SECTION_COLOR_HEADER[color]).toBeTruthy()
    }
  })
})
