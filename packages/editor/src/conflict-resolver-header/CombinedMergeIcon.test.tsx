import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CombinedMergeIcon } from './CombinedMergeIcon'

describe('CombinedMergeIcon', () => {
  it('renders an inline svg forwarding the className', () => {
    const { container } = render(<CombinedMergeIcon className="h-3.5 w-3.5" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveClass('h-3.5', 'w-3.5')
    // The three glyph strokes (incoming arrow, branch curve, merge arrowhead).
    expect(svg!.querySelectorAll('path')).toHaveLength(3)
  })
})
