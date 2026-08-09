import { describe, it, expect } from 'vitest'
import { buildFileTree, filterFileTree, findDirectoryNodes } from './fileTree'

const PATHS = [
  'src/components/Button.tsx',
  'src/components/Input.tsx',
  'src/index.ts',
  'README.md',
  'docs/guide/setup.md',
]

describe('buildFileTree', () => {
  it('nests paths into directories and sorts directories before files', () => {
    const tree = buildFileTree(PATHS)

    expect(tree.map((n) => n.name)).toEqual(['docs', 'src', 'README.md'])
    expect(tree.map((n) => n.isDir)).toEqual([true, true, false])
  })

  it('gives every node the full path it was built from', () => {
    const tree = buildFileTree(PATHS)
    const src = tree.find((n) => n.name === 'src')

    expect(src?.path).toBe('src')
    expect(src?.children?.find((n) => n.name === 'components')?.path).toBe('src/components')
    expect(
      src?.children?.find((n) => n.name === 'components')?.children?.map((n) => n.path)
    ).toEqual(['src/components/Button.tsx', 'src/components/Input.tsx'])
  })

  it('returns nothing for an empty list', () => {
    expect(buildFileTree([])).toEqual([])
  })
})

describe('findDirectoryNodes', () => {
  const tree = buildFileTree(PATHS)

  it('returns the roots for an empty path', () => {
    expect(findDirectoryNodes(tree, '')).toBe(tree)
  })

  it('walks nested directories', () => {
    expect(findDirectoryNodes(tree, 'src/components').map((n) => n.name)).toEqual([
      'Button.tsx',
      'Input.tsx',
    ])
  })

  it('returns nothing for a path that no longer exists, or for a file', () => {
    expect(findDirectoryNodes(tree, 'src/gone')).toEqual([])
    expect(findDirectoryNodes(tree, 'src/index.ts')).toEqual([])
  })
})

describe('filterFileTree', () => {
  const tree = buildFileTree(PATHS)

  it('returns the tree untouched for a blank query', () => {
    expect(filterFileTree(tree, '')).toBe(tree)
    expect(filterFileTree(tree, '   ')).toBe(tree)
  })

  it('keeps only the branches leading to a match', () => {
    const filtered = filterFileTree(tree, 'button')

    expect(filtered.map((n) => n.name)).toEqual(['src'])
    expect(filtered[0].children?.map((n) => n.name)).toEqual(['components'])
    expect(filtered[0].children?.[0].children?.map((n) => n.name)).toEqual(['Button.tsx'])
  })

  it('matches a file name case-insensitively', () => {
    expect(filterFileTree(tree, 'BUTTON')[0].children?.[0].children?.map((n) => n.name)).toEqual([
      'Button.tsx',
    ])
  })

  /**
   * A directory is never a match itself. It used to be one — matched on its path and kept whole —
   * so a result meant either "the file you asked for" or "a file under a folder you asked for", and
   * the row you clicked was rarely the row you wanted.
   */
  it('does not answer a query naming a directory', () => {
    expect(filterFileTree(tree, 'docs')).toEqual([])
    expect(filterFileTree(tree, 'components')).toEqual([])
  })

  /** Matching the name rather than the path is what keeps the rule above from coming back in
   * through the path: `src/index.ts` must not answer `src` either. */
  it('does not answer a query naming a directory in the path of a file', () => {
    expect(filterFileTree(tree, 'src/index')).toEqual([])
    expect(filterFileTree(tree, 'src')).toEqual([])
  })

  it('keeps the directories above a match, as the path to it and nothing more', () => {
    const filtered = filterFileTree(tree, 'setup')

    expect(filtered.map((n) => n.name)).toEqual(['docs'])
    expect(filtered[0].children?.map((n) => n.name)).toEqual(['guide'])
    expect(filtered[0].children?.[0].children?.map((n) => n.name)).toEqual(['setup.md'])
  })

  it('returns nothing when nothing matches', () => {
    expect(filterFileTree(tree, 'nope')).toEqual([])
  })

  it('leaves the source tree unmodified', () => {
    filterFileTree(tree, 'button')
    expect(findDirectoryNodes(tree, 'src/components')).toHaveLength(2)
  })
})
