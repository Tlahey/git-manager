import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { apiGetFileHistory } = vi.hoisted(() => ({ apiGetFileHistory: vi.fn() }))
vi.mock('../../../api/git.api', () => ({ apiGetFileHistory }))

const { useTrackedFiles } = vi.hoisted(() => ({ useTrackedFiles: vi.fn() }))
vi.mock('../../../hooks/useTrackedFiles', () => ({ useTrackedFiles }))

import { useFileLookupCommands, scoreFileMatch, rankFileMatches } from './useFileLookupCommands'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useRepoViewStore } from '../../../stores/repoView.store'

const INITIAL = useRepoUIStore.getState()

const FILES = [
  'src/components/git-graph/mergeBlockLayout.ts',
  'src/components/git-graph/MergeEditor.tsx',
  'src/stores/repoUI.store.ts',
  'README.md',
]

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState(INITIAL, true)
  useRepoViewStore.setState({ view: 'graph', isPanelOpen: true })
  useTrackedFiles.mockReturnValue({ data: FILES })
  apiGetFileHistory.mockResolvedValue([{ oid: 'abc123' }])
})

function commands(query: string) {
  const { result } = renderHook(() => useFileLookupCommands(query))
  return result.current
}

describe('scoreFileMatch', () => {
  it('ranks a basename prefix match best', () => {
    const prefix = scoreFileMatch('src/a/readme.md', 'read')
    const contains = scoreFileMatch('src/a/myreadme.md', 'read')
    const pathOnly = scoreFileMatch('read/a/x.md', 'read')
    expect(prefix).not.toBeNull()
    expect(contains).not.toBeNull()
    expect(pathOnly).not.toBeNull()
    expect(prefix!).toBeLessThan(contains!)
    expect(contains!).toBeLessThan(pathOnly!)
  })

  it('returns null when the query is nowhere in the path', () => {
    expect(scoreFileMatch('src/a/x.md', 'zzz')).toBeNull()
  })
})

describe('rankFileMatches', () => {
  it('keeps only matches, best first', () => {
    const ranked = rankFileMatches(FILES, 'merge')
    expect(ranked).toEqual([
      'src/components/git-graph/MergeEditor.tsx',
      'src/components/git-graph/mergeBlockLayout.ts',
    ])
  })
})

describe('useFileLookupCommands', () => {
  it('returns nothing for a too-short query', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    expect(commands('m')).toEqual([])
  })

  it('returns nothing when there is no active repo', () => {
    useRepoUIStore.setState({ activeRepo: null })
    expect(commands('merge')).toEqual([])
  })

  it('surfaces matching files as file-group commands with name + dir', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const cmds = commands('merge')
    expect(cmds.map((c) => c.id)).toEqual([
      'file-lookup-src/components/git-graph/MergeEditor.tsx',
      'file-lookup-src/components/git-graph/mergeBlockLayout.ts',
    ])
    expect(cmds[0]).toMatchObject({
      group: 'files',
      title: 'MergeEditor.tsx',
      value: 'src/components/git-graph/MergeEditor.tsx',
      subtitle: 'src/components/git-graph',
      keywords: ['src/components/git-graph/MergeEditor.tsx'],
    })
  })

  it('opens the file at its latest commit on the File tab with the history panel', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const cmd = commands('repoUI').find((c) => c.id.endsWith('repoUI.store.ts'))!

    await cmd.run()

    expect(apiGetFileHistory).toHaveBeenCalledWith('/repo', 'src/stores/repoUI.store.ts', 1)
    const state = useRepoUIStore.getState()
    expect(state.activeDiffFile).toEqual({
      path: 'src/stores/repoUI.store.ts',
      staged: false,
      oid: 'abc123',
      initialTab: 'file',
    })
    expect(state.activeLeftPanel).toBe('history')
  })

  it('still opens the file (working-tree version) when history lookup fails', async () => {
    apiGetFileHistory.mockRejectedValue(new Error('no history'))
    useRepoUIStore.setState({ activeRepo: '/repo' })
    const cmd = commands('README').find((c) => c.id.endsWith('README.md'))!

    await cmd.run()

    const state = useRepoUIStore.getState()
    expect(state.activeDiffFile).toEqual({
      path: 'README.md',
      staged: false,
      oid: undefined,
      initialTab: 'file',
    })
    expect(state.activeLeftPanel).toBe('history')
  })
})

// A diff has two homes — the graph's centre slot and the files view — so ⌘P only has to move the
// user off the board, the one view that cannot draw one.
describe('useFileLookupCommands — where the diff opens', () => {
  it('leaves the board for the content view', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoViewStore.setState({ view: 'board' })

    await commands('repoUI')
      .find((c) => c.id.endsWith('repoUI.store.ts'))!
      .run()

    expect(useRepoViewStore.getState().view).toBe('graph')
  })

  it('stays on the files view, where the diff was already going to appear', async () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoViewStore.setState({ view: 'files' })

    await commands('repoUI')
      .find((c) => c.id.endsWith('repoUI.store.ts'))!
      .run()

    expect(useRepoViewStore.getState().view).toBe('files')
    expect(useRepoUIStore.getState().activeDiffFile?.path).toBe('src/stores/repoUI.store.ts')
  })
})
