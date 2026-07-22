import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { GitRef } from '@git-manager/git-types'
import { RefLabelGroup } from './RefLabelGroup'

function ref(overrides: Partial<GitRef> = {}): GitRef {
  return {
    name: `refs/heads/${overrides.shortName ?? 'x'}`,
    shortName: 'x',
    type: 'branch',
    commitOid: 'abc',
    ...overrides,
  }
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
  it('shows the local "main" branch first when it is the only local branch', () => {
    const refs = [
      ref({ type: 'tag', shortName: 'v1.0' }),
      ref({ type: 'remote', shortName: 'origin/main' }),
      ref({ type: 'branch', shortName: 'main' }),
    ]
    render(<RefLabelGroup refs={refs} />)
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('surfaces a coexisting local branch over main, pushing main into the overflow and dropping HEAD', () => {
    const refs = [
      ref({ type: 'tag', shortName: 'v1.0' }),
      ref({ type: 'branch', shortName: 'main' }),
      ref({ type: 'HEAD', shortName: 'HEAD' }),
      ref({ type: 'branch', shortName: 'feature' }),
    ]
    render(<RefLabelGroup refs={refs} />)
    // The coexisting branch is the primary badge; HEAD is gone, so only main + the tag remain hidden.
    expect(screen.getByText('feature')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.queryByText('main')).not.toBeInTheDocument()
    expect(screen.queryByText('HEAD')).not.toBeInTheDocument()

    // main is revealed on hovering the group (in the overflow panel); HEAD never appears.
    fireEvent.mouseEnter(screen.getByTestId('ref-label-group'))
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('v1.0')).toBeInTheDocument()
    expect(screen.queryByText('HEAD')).not.toBeInTheDocument()
  })

  it('surfaces a coexisting branch over origin/main (local main behind) and drops HEAD', () => {
    const refs = [
      ref({ type: 'remote', shortName: 'origin/main' }),
      ref({ type: 'HEAD', shortName: 'HEAD' }),
      ref({ type: 'branch', shortName: 'claude/menu-worktree' }),
    ]
    render(<RefLabelGroup refs={refs} />)
    expect(screen.getByText('claude/menu-worktree')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.queryByText('main')).not.toBeInTheDocument() // origin/main is in the overflow
    expect(screen.queryByText('HEAD')).not.toBeInTheDocument()

    // origin/main (rendered as "main") shows on hovering the group; HEAD never appears.
    fireEvent.mouseEnter(screen.getByTestId('ref-label-group'))
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.queryByText('HEAD')).not.toBeInTheDocument()
  })

  it('collapses local main + origin/main into a single overflow "main" beside a coexisting branch', () => {
    const refs = [
      ref({ type: 'branch', shortName: 'main' }),
      ref({ type: 'remote', shortName: 'origin/main' }),
      ref({ type: 'HEAD', shortName: 'HEAD' }),
      ref({ type: 'branch', shortName: 'claude/menu-worktree' }),
    ]
    render(<RefLabelGroup refs={refs} />)
    // Branch is primary; overflow holds a single "main" (local main deduped away), no HEAD.
    expect(screen.getByText('claude/menu-worktree')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByTestId('ref-label-group'))
    expect(screen.getAllByText('main')).toHaveLength(1)
    expect(screen.queryByText('HEAD')).not.toBeInTheDocument()
  })

  it('shows the remote main branch first when there is no local branch beside it', () => {
    const refs = [
      ref({ type: 'tag', shortName: 'v1.0' }),
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

  it('drops the redundant HEAD badge when a local branch marks the same commit', () => {
    // The main tip with HEAD on it: only "main" should show, no "+1"/HEAD overflow.
    const refs = [ref({ type: 'branch', shortName: 'main' }), ref({ type: 'HEAD', shortName: 'HEAD' })]
    render(<RefLabelGroup refs={refs} />)
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.queryByText('HEAD')).not.toBeInTheDocument()
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument()
  })

  it('keeps HEAD for a detached HEAD (no branch on the commit), preferring it over a tag', () => {
    const refs = [ref({ type: 'tag', shortName: 'v1.0' }), ref({ type: 'HEAD', shortName: 'HEAD' })]
    render(<RefLabelGroup refs={refs} />)
    expect(screen.getByText('HEAD')).toBeInTheDocument()
  })
})

describe('RefLabelGroup — hover panel', () => {
  it('reveals every ref (stacked, primary included) on group hover and hides them on leave', () => {
    const refs = [
      ref({ type: 'branch', shortName: 'develop' }),
      ref({ type: 'branch', shortName: 'feature-a' }),
      ref({ type: 'tag', shortName: 'v2.0' }),
    ]
    render(<RefLabelGroup refs={refs} />)
    expect(screen.queryByText('feature-a')).not.toBeInTheDocument()

    // Hovering anywhere on the group (not just the "+N" badge) opens the panel.
    fireEvent.mouseEnter(screen.getByTestId('ref-label-group'))
    expect(screen.getByText('feature-a')).toBeInTheDocument()
    expect(screen.getByText('v2.0')).toBeInTheDocument()
    // The primary ref is repeated inside the panel so the stack lists the commit's full set.
    expect(screen.getAllByText('develop')).toHaveLength(2)

    fireEvent.mouseLeave(screen.getByTestId('ref-label-group'))
    expect(screen.queryByText('feature-a')).not.toBeInTheDocument()
  })

  it('keeps the panel open while hovering the panel itself', () => {
    const refs = [ref({ shortName: 'develop' }), ref({ shortName: 'feature-a' })]
    render(<RefLabelGroup refs={refs} />)
    fireEvent.mouseEnter(screen.getByTestId('ref-label-group'))
    const panel = screen.getByTestId('ref-label-group-more-popover')
    fireEvent.mouseEnter(panel)
    expect(screen.getByText('feature-a')).toBeInTheDocument()
  })

  it('closes the panel when a drag started from a stacked badge ends', () => {
    const refs = [ref({ shortName: 'develop' }), ref({ shortName: 'feature-a' })]
    render(<RefLabelGroup refs={refs} />)
    fireEvent.mouseEnter(screen.getByTestId('ref-label-group'))
    const panel = screen.getByTestId('ref-label-group-more-popover')
    fireEvent.dragEnd(panel)
    expect(screen.queryByTestId('ref-label-group-more-popover')).not.toBeInTheDocument()
  })
})
