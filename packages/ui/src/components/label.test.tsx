import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { Label } from './label'
import { Checkbox } from './checkbox'

describe('Label', () => {
  it('renders its children', () => {
    render(<Label>Enable feature</Label>)
    expect(screen.getByText('Enable feature')).toBeInTheDocument()
  })

  it('associates with a control via htmlFor and toggles it on click', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Label htmlFor="feat">Enable feature</Label>
        <Checkbox id="feat" aria-label="Enable feature" />
      </>
    )
    const box = screen.getByRole('checkbox', { name: 'Enable feature' })
    expect(box).not.toBeChecked()
    await user.click(screen.getByText('Enable feature'))
    expect(box).toBeChecked()
  })

  it('merges a custom className', () => {
    render(<Label className="extra-class">Label</Label>)
    expect(screen.getByText('Label').className).toContain('extra-class')
  })

  it('forwards the ref to the label element', () => {
    const ref = createRef<HTMLLabelElement>()
    render(<Label ref={ref}>Label</Label>)
    expect(ref.current).toBeInstanceOf(HTMLLabelElement)
  })
})
