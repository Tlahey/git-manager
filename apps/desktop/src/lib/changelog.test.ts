import { describe, it, expect } from 'vitest'
import { parseChangelog } from './changelog'

const fixture = `# Changelog

## [Unreleased]

### Added

- New thing one
- New thing two

## [0.2.0] - 2026-07-01

### Added

- Feature A

### Fixed

- Bug B

## [0.1.0] - 2026-06-30

Initial release.

### Added

- First feature
`

const prFixture = `## [0.3.0] - 2026-07-15

* PR one by @user in https://github.com/owner/repo/pull/1
* PR two by @user in https://github.com/owner/repo/pull/2
`

describe('parseChangelog', () => {
  it('parses each version heading into an entry, newest first', () => {
    const entries = parseChangelog(fixture)
    expect(entries.map((e) => e.version)).toEqual(['Unreleased', '0.2.0', '0.1.0'])
  })

  it('extracts the release date when present', () => {
    const entries = parseChangelog(fixture)
    expect(entries.find((e) => e.version === 'Unreleased')?.date).toBeNull()
    expect(entries.find((e) => e.version === '0.2.0')?.date).toBe('2026-07-01')
  })

  it('groups bullet items under their ### section heading', () => {
    const entries = parseChangelog(fixture)
    const v020 = entries.find((e) => e.version === '0.2.0')!
    expect(v020.sections).toEqual([
      { heading: 'Added', items: ['Feature A'] },
      { heading: 'Fixed', items: ['Bug B'] },
    ])
  })

  it('ignores freeform prose lines outside of a section', () => {
    const entries = parseChangelog(fixture)
    const v010 = entries.find((e) => e.version === '0.1.0')!
    expect(v010.sections).toEqual([{ heading: 'Added', items: ['First feature'] }])
  })

  it('returns an empty list for content with no version headings', () => {
    expect(parseChangelog('# Changelog\n\nNothing here yet.\n')).toEqual([])
  })

  it('groups bullets found directly under a version heading (no ### subsection) into an implicit section', () => {
    const entries = parseChangelog(prFixture)
    expect(entries).toEqual([
      {
        version: '0.3.0',
        date: '2026-07-15',
        sections: [
          {
            heading: '',
            items: [
              'PR one by @user in https://github.com/owner/repo/pull/1',
              'PR two by @user in https://github.com/owner/repo/pull/2',
            ],
          },
        ],
      },
    ])
  })

  it('accepts both "-" and "*" as bullet markers', () => {
    const mixed = '## [1.0.0]\n\n- dash item\n* star item\n'
    const entries = parseChangelog(mixed)
    expect(entries[0].sections[0].items).toEqual(['dash item', 'star item'])
  })
})
