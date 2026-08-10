import { describe, it, expect } from 'vitest'
import { fileName, dirName, splitPath } from './filePath'

describe('filePath', () => {
  it('splits a nested path, keeping the slash on the directory', () => {
    expect(splitPath('src/lib/filePath.ts')).toEqual({ dir: 'src/lib/', name: 'filePath.ts' })
    expect(fileName('src/lib/filePath.ts')).toBe('filePath.ts')
    expect(dirName('src/lib/filePath.ts')).toBe('src/lib')
  })

  /**
   * The trailing slash is the whole reason both forms exist: `splitPath` keeps it so `dir + name`
   * is the path again, which is what the callers rendering the two side by side rely on; `dirName`
   * drops it because its caller renders them apart.
   */
  it('reassembles the original path from splitPath but not from dirName', () => {
    const path = 'apps/desktop/src/main.tsx'
    const { dir, name } = splitPath(path)
    expect(dir + name).toBe(path)
    expect(dirName(path) + fileName(path)).not.toBe(path)
  })

  it('reports no directory for a path at the root', () => {
    expect(splitPath('README.md')).toEqual({ dir: '', name: 'README.md' })
    expect(dirName('README.md')).toBe('')
    expect(fileName('README.md')).toBe('README.md')
  })

  /** A path is repo-relative and comes from git, so `/` is the separator whatever the platform. */
  it('splits on the last slash only, whatever comes before it', () => {
    expect(splitPath('a/b/c/d.txt').dir).toBe('a/b/c/')
    expect(fileName('weird/name with spaces.txt')).toBe('name with spaces.txt')
  })

  it('handles a trailing slash by reporting an empty name', () => {
    expect(splitPath('src/lib/')).toEqual({ dir: 'src/lib/', name: '' })
  })
})
