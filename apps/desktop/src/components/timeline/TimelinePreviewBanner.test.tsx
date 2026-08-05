import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TimelinePreviewBanner } from './TimelinePreviewBanner'

describe('TimelinePreviewBanner', () => {
  it('says how many commits the step takes away', () => {
    render(<TimelinePreviewBanner delta={{ removed: 3, added: 0 }} />)
    expect(screen.getByTestId('timeline-removed')).toHaveTextContent('3 commits removed')
    expect(screen.queryByTestId('timeline-added')).not.toBeInTheDocument()
  })

  it('says how many it brings back', () => {
    render(<TimelinePreviewBanner delta={{ removed: 0, added: 1 }} />)
    expect(screen.getByTestId('timeline-added')).toHaveTextContent('1 commit restored')
    expect(screen.queryByTestId('timeline-removed')).not.toBeInTheDocument()
  })

  it('states both sides of a step that rewrites history', () => {
    render(<TimelinePreviewBanner delta={{ removed: 2, added: 2 }} />)
    expect(screen.getByTestId('timeline-removed')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-added')).toBeInTheDocument()
  })

  it('leaves the graph unadorned when the step changes no commit', () => {
    // Landing back on the current position, or a step that moves no HEAD.
    render(<TimelinePreviewBanner delta={{ removed: 0, added: 0 }} />)
    expect(screen.queryByTestId('timeline-preview-banner')).not.toBeInTheDocument()
  })
})
