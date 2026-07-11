import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Waterline } from './Waterline'

describe('Waterline', () => {
  it('renders the given label', () => {
    render(<Waterline label="Il y a 2 heures" />)
    expect(screen.getByText('Il y a 2 heures')).toBeInTheDocument()
  })
})
