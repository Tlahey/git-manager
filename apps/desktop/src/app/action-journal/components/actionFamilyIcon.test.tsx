import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ActionFamilyIcon } from './actionFamilyIcon'
import type { GitCommandFamily } from '../../../lib/gitCommandCatalog'

const FAMILIES: GitCommandFamily[] = [
  'staging',
  'commit',
  'branch',
  'history',
  'remote',
  'stash',
  'worktree',
  'conflict',
  'repo',
]

describe('ActionFamilyIcon', () => {
  it('renders an icon for every family the catalog can produce', () => {
    // A family added to the catalog without a row here would render `undefined` and crash the journal.
    for (const family of FAMILIES) {
      const { container, unmount } = render(<ActionFamilyIcon family={family} />)
      expect(container.querySelector('svg')).not.toBeNull()
      unmount()
    }
  })

  it('is decorative — the row already names the action in text', () => {
    const { container } = render(<ActionFamilyIcon family="commit" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('gives history the warning tone, since those are the commands to notice', () => {
    const { container } = render(<ActionFamilyIcon family="history" />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-tone-warning')
  })

  it('accepts a size override and keeps the tone', () => {
    const { container } = render(<ActionFamilyIcon family="remote" className="h-5 w-5" />)
    const className = container.querySelector('svg')?.getAttribute('class') ?? ''
    expect(className).toContain('h-5 w-5')
    expect(className).toContain('text-tone-info')
  })
})
