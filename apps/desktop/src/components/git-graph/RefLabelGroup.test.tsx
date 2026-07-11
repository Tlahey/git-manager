import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { GitRef } from '@git-manager/git-types'
import { RefLabelGroup } from './RefLabelGroup'

function ref(overrides: Partial<GitRef> = {}): GitRef {
  return { name: `refs/heads/${overrides.shortName ?? 'x'}`, shortName: 'x', type: 'branch', commitOid: 'abc', ...overrides }
}

describe('RefLabelGroup — empty/single', () => {
  it('renders nothing when there are no refs', () => {
    const { container } = render(<RefLabelGroup refs={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a single ref without a "+N" badge', () => {
    render(<RefLabelGroup refs={[ref({ shortName: 'feature' })]} />)
    expect(screen.getByText('feature')).toBeInTheDocument()
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument()
  })
})

describe('RefLabelGroup — sorting priority', () => {
  it('shows the local "main" branch first over everything else', () => {
    const refs = [
      ref({ type: 'tag', shortName: 'v1.0' }),
      ref({ type: 'remote', shortName: 'origin/main' }),
      ref({ type: 'branch', shortName: 'main' }),
      ref({ type: 'branch', shortName: 'feature' }),
    ]
    render(<RefLabelGroup refs={refs} />)
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('shows the remote main branch first when there is no local main', () => {
    const refs = [
      ref({ type: 'tag', shortName: 'v1.0' }),
      ref({ type: 'branch', shortName: 'feature' }),
      ref({ type: 'remote', shortName: 'origin/main' }),
    ]
    render(<RefLabelGroup refs={refs} />)
    expect(screen.getByText('main')).toBeInTheDocument() // remote/main stripped of "origin/"
  })

  it('prefers a plain local branch over a remote branch or a tag', () => {
    const refs = [
      ref({ type: 'tag', shortName: 'v1.0' }),
      ref({ type: 'remote', shortName: 'origin/other' }),
      ref({ type: 'branch', shortName: 'feature' }),
    ]
    render(<RefLabelGroup refs={refs} />)
    expect(screen.getByText('feature')).toBeInTheDocument()
  })

  it('prefers HEAD over a tag when nothing else qualifies', () => {
    const refs = [ref({ type: 'tag', shortName: 'v1.0' }), ref({ type: 'HEAD', shortName: 'HEAD' })]
    render(<RefLabelGroup refs={refs} />)
    expect(screen.getByText('HEAD')).toBeInTheDocument()
  })
})

describe('RefLabelGroup — hover panel', () => {
  it('reveals the remaining refs on hover and hides them again on mouse leave', () => {
    const refs = [
      ref({ type: 'branch', shortName: 'main' }),
      ref({ type: 'branch', shortName: 'feature-a' }),
      ref({ type: 'tag', shortName: 'v2.0' }),
    ]
    render(<RefLabelGroup refs={refs} />)
    expect(screen.queryByText('feature-a')).not.toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByText('+2'))
    expect(screen.getByText('feature-a')).toBeInTheDocument()
    expect(screen.getByText('v2.0')).toBeInTheDocument()

    fireEvent.mouseLeave(screen.getByText('+2'))
    expect(screen.queryByText('feature-a')).not.toBeInTheDocument()
  })

  it('keeps the panel open while hovering the panel itself', () => {
    const refs = [ref({ shortName: 'main' }), ref({ shortName: 'feature-a' })]
    render(<RefLabelGroup refs={refs} />)
    fireEvent.mouseEnter(screen.getByText('+1'))
    const panelText = screen.getByText('feature-a')
    fireEvent.mouseEnter(panelText.closest('div')!)
    expect(screen.getByText('feature-a')).toBeInTheDocument()
  })
})
