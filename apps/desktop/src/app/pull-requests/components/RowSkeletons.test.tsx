import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PRRowSkeleton, IssueRowSkeleton } from './RowSkeletons'

describe('RowSkeletons', () => {
  it('renders the PR row skeleton placeholder without crashing', () => {
    const { container } = render(<PRRowSkeleton />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('renders the issue row skeleton placeholder without crashing', () => {
    const { container } = render(<IssueRowSkeleton />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })
})
