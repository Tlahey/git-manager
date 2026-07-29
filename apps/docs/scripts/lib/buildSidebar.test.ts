import { describe, expect, it } from 'vitest'
import { buildSidebar } from './buildSidebar.ts'
import type { DocFeature } from './parseDocFeatures.ts'

function feature(slug: string, name: string): DocFeature {
  return { sourcePath: `apps/e2e/features/${slug}.feature`, slug, name, paragraphs: [], scenarios: [] }
}

const SECTIONS = [
  { title: 'Reading your repository', features: ['commit-graph'] },
  { title: 'Making changes', features: ['working-tree', 'commit'] },
]

describe('buildSidebar', () => {
  it('groups features in the curated order, not the order they were parsed', () => {
    const groups = buildSidebar(
      [feature('working-tree', 'Working tree'), feature('commit-graph', 'The commit graph')],
      SECTIONS,
      'More features'
    )
    expect(groups).toEqual([
      {
        text: 'Reading your repository',
        items: [{ text: 'The commit graph', link: '/docs/features/commit-graph' }],
      },
      { text: 'Making changes', items: [{ text: 'Working tree', link: '/docs/features/working-tree' }] },
    ])
  })

  it('drops a section whose features are all missing rather than rendering it empty', () => {
    const groups = buildSidebar([feature('commit-graph', 'The commit graph')], SECTIONS, 'More')
    expect(groups.map((g) => g.text)).toEqual(['Reading your repository'])
  })

  it('collects unplaced features alphabetically into the fallback section', () => {
    const groups = buildSidebar(
      [feature('worktree', 'Worktrees'), feature('stash-stack', 'Stashes')],
      SECTIONS,
      'More features'
    )
    expect(groups).toEqual([
      {
        text: 'More features',
        items: [
          { text: 'Stashes', link: '/docs/features/stash-stack' },
          { text: 'Worktrees', link: '/docs/features/worktree' },
        ],
      },
    ])
  })
})
