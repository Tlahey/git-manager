import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileTree, getSortedNodes, type FileTreeInputFile, type TreeNode } from './useFileTree'

function file(
  path: string,
  status = 'modified',
  overrides: Partial<FileTreeInputFile> = {}
): FileTreeInputFile {
  return { path, status, ...overrides }
}

describe('getSortedNodes', () => {
  it('sorts folders before files regardless of name', () => {
    const nodes: Record<string, TreeNode> = {
      zzz: { name: 'zzz', path: 'zzz', isFolder: false },
      aaa: { name: 'aaa', path: 'aaa', isFolder: true, children: {} },
    }
    expect(getSortedNodes(nodes).map((n) => n.name)).toEqual(['aaa', 'zzz'])
  })

  it('sorts same-kind entries alphabetically, case-insensitively', () => {
    const nodes: Record<string, TreeNode> = {
      Banana: { name: 'Banana', path: 'Banana', isFolder: false },
      apple: { name: 'apple', path: 'apple', isFolder: false },
    }
    expect(getSortedNodes(nodes).map((n) => n.name)).toEqual(['apple', 'Banana'])
  })

  it('sorts numerically ("file2" before "file10")', () => {
    const nodes: Record<string, TreeNode> = {
      file10: { name: 'file10', path: 'file10', isFolder: false },
      file2: { name: 'file2', path: 'file2', isFolder: false },
    }
    expect(getSortedNodes(nodes).map((n) => n.name)).toEqual(['file2', 'file10'])
  })
})

describe('useFileTree — tree building', () => {
  it('builds nested folders from slash-separated paths', () => {
    const files = [file('src/components/Button.tsx'), file('README.md')]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    const root = result.current.treeRoot
    expect(root.src.isFolder).toBe(true)
    expect(root.src.children!.components.isFolder).toBe(true)
    expect(root.src.children!.components.children!['Button.tsx'].isFolder).toBe(false)
    expect(root['README.md'].isFolder).toBe(false)
  })

  it('carries file metadata (status/additions/deletions/staged) onto the leaf node only', () => {
    const files = [file('a.ts', 'modified', { additions: 3, deletions: 1, staged: true })]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    const leaf = result.current.treeRoot['a.ts']
    expect(leaf).toMatchObject({ status: 'modified', additions: 3, deletions: 1, staged: true })
  })

  it('aggregates per-folder stats from descendant file statuses', () => {
    const files = [
      file('src/a.ts', 'added'),
      file('src/b.ts', 'modified'),
      file('src/c.ts', 'deleted'),
      file('src/d.ts', 'renamed'),
      file('src/e.ts', 'untracked'),
    ]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    expect(result.current.treeRoot.src.stats).toEqual({
      added: 2,
      modified: 1,
      deleted: 1,
      renamed: 1,
    })
  })

  it('rolls stats up through multiple nesting levels', () => {
    const files = [file('a/b/c/deep.ts', 'added')]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    const root = result.current.treeRoot
    expect(root.a.stats).toEqual({ added: 1, modified: 0, deleted: 0, renamed: 0 })
    expect(root.a.children!.b.stats).toEqual({ added: 1, modified: 0, deleted: 0, renamed: 0 })
  })
})

describe('useFileTree — search filtering', () => {
  it('filters files by case-insensitive path substring match', () => {
    const files = [file('src/Button.tsx'), file('src/utils.ts')]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    act(() => result.current.setSearchQuery('button'))
    expect(result.current.filteredFiles.map((f) => f.path)).toEqual(['src/Button.tsx'])
  })

  it('returns every file when the search query is blank/whitespace', () => {
    const files = [file('a.ts'), file('b.ts')]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    act(() => result.current.setSearchQuery('   '))
    expect(result.current.filteredFiles).toHaveLength(2)
  })

  it('auto-expands ancestor folders of matched files and flips the button to "collapse"', () => {
    const files = [file('src/deep/nested/match.ts'), file('other/skip.ts')]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    act(() => result.current.setSearchQuery('match'))
    expect(result.current.expandedFolders).toEqual(new Set(['src', 'src/deep', 'src/deep/nested']))
    expect(result.current.buttonState).toBe('collapse')
  })
})

describe('useFileTree — expand/collapse', () => {
  it('starts fully collapsed by default', () => {
    const files = [file('src/a.ts')]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    expect(result.current.expandedFolders.size).toBe(0)
    expect(result.current.buttonState).toBe('expand')
  })

  it('starts fully expanded when defaultExpanded is set', () => {
    const files = [file('src/a.ts'), file('lib/b.ts')]
    const { result } = renderHook(() => useFileTree(files, 'key1', { defaultExpanded: true }))
    expect(result.current.expandedFolders).toEqual(new Set(['src', 'lib']))
    expect(result.current.buttonState).toBe('collapse')
  })

  it('toggleFolder expands a folder', () => {
    const files = [file('src/a.ts')]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    act(() => result.current.toggleFolder('src'))
    expect(result.current.expandedFolders.has('src')).toBe(true)
  })

  it('toggleFolder collapses an expanded folder and flips the button to "expand" when others remain expanded', () => {
    const files = [file('src/a.ts'), file('lib/b.ts')]
    const { result } = renderHook(() => useFileTree(files, 'key1', { defaultExpanded: true }))
    act(() => result.current.toggleFolder('src'))
    expect(result.current.expandedFolders.has('src')).toBe(false)
    expect(result.current.expandedFolders.has('lib')).toBe(true)
    expect(result.current.buttonState).toBe('expand')
  })

  it('expanding a folder auto-expands a chain of single-child descendant folders', () => {
    const files = [file('a/b/c/leaf.ts')]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    act(() => result.current.toggleFolder('a'))
    expect(result.current.expandedFolders).toEqual(new Set(['a', 'a/b', 'a/b/c']))
  })

  it('does not auto-expand past a folder with multiple children', () => {
    const files = [file('a/b/one.ts'), file('a/b/two.ts')]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    act(() => result.current.toggleFolder('a'))
    expect(result.current.expandedFolders).toEqual(new Set(['a', 'a/b']))
  })

  it('toggleExpandAll expands every folder, then collapses them all on a second call', () => {
    const files = [file('a/x.ts'), file('b/y.ts')]
    const { result } = renderHook(() => useFileTree(files, 'key1'))
    act(() => result.current.toggleExpandAll())
    expect(result.current.expandedFolders).toEqual(new Set(['a', 'b']))
    expect(result.current.buttonState).toBe('collapse')

    act(() => result.current.toggleExpandAll())
    expect(result.current.expandedFolders.size).toBe(0)
    expect(result.current.buttonState).toBe('expand')
  })
})

describe('useFileTree — resetKey', () => {
  it('resets expandedFolders/buttonState to collapsed when resetKey changes and defaultExpanded is false', () => {
    const files = [file('src/a.ts')]
    const { result, rerender } = renderHook(({ files, key }) => useFileTree(files, key), {
      initialProps: { files, key: 'key1' },
    })
    act(() => result.current.toggleFolder('src'))
    expect(result.current.expandedFolders.has('src')).toBe(true)

    rerender({ files, key: 'key2' })
    expect(result.current.expandedFolders.size).toBe(0)
    expect(result.current.buttonState).toBe('expand')
  })

  it('resets to fully expanded when resetKey changes and defaultExpanded is true', () => {
    const files = [file('src/a.ts'), file('lib/b.ts')]
    const { result, rerender } = renderHook(
      ({ files, key }) => useFileTree(files, key, { defaultExpanded: true }),
      {
        initialProps: { files, key: 'key1' },
      }
    )
    act(() => result.current.toggleFolder('src'))
    expect(result.current.expandedFolders.has('src')).toBe(false)

    rerender({ files, key: 'key2' })
    expect(result.current.expandedFolders).toEqual(new Set(['src', 'lib']))
    expect(result.current.buttonState).toBe('collapse')
  })
})
