import { describe, it, expect } from 'vitest'
import { buildFileTree, filterFileTree, findDirectoryNodes } from './utils'

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
      src?.children
        ?.find((n) => n.name === 'components')
        ?.children?.map((n) => n.path)
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

  it('matches case-insensitively on the whole path', () => {
    expect(filterFileTree(tree, 'SRC/INDEX').map((n) => n.name)).toEqual(['src'])
  })

  it('keeps a matching directory whole, contents included', () => {
    const filtered = filterFileTree(tree, 'docs')

    expect(filtered.map((n) => n.name)).toEqual(['docs'])
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
