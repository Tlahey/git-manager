import { describe, it, expect, beforeEach } from 'vitest'
import {
  remoteOperationKey,
  useRemoteProgressStore,
  type RemoteOperationEntry,
} from './remoteProgress.store'

function entries(): RemoteOperationEntry[] {
  return Object.values(useRemoteProgressStore.getState().operations)
}

function entryFor(repoPath: string, operation: RemoteOperationEntry['operation']) {
  return useRemoteProgressStore.getState().operations[remoteOperationKey(repoPath, operation)]
}

beforeEach(() => {
  useRemoteProgressStore.setState({ operations: {} })
})

describe('remoteOperationKey', () => {
  it('keys on the repository and the operation, which are two separate waits', () => {
    expect(remoteOperationKey('/repo', 'fetch')).not.toBe(remoteOperationKey('/repo', 'push'))
    expect(remoteOperationKey('/a', 'fetch')).not.toBe(remoteOperationKey('/b', 'fetch'))
  })
})

describe('useRemoteProgressStore', () => {
  it('records a transfer as running, with no counts yet', () => {
    // The first progress report only arrives once the server answers; until then all that is known
    // is that something started.
    useRemoteProgressStore.getState().start('/repo', 'fetch')
    expect(entryFor('/repo', 'fetch')).toMatchObject({ progress: null, outcome: null })
  })

  it('assumes a person asked for it, and records when a timer did', () => {
    // The two are worth different amounts of attention and only the call site can tell them apart,
    // so the default is the one that shows a card — a producer that forgets stays visible.
    const { start } = useRemoteProgressStore.getState()
    start('/repo', 'push')
    expect(entryFor('/repo', 'push')?.background).toBe(false)

    start('/repo', 'fetch', true)
    expect(entryFor('/repo', 'fetch')?.background).toBe(true)
  })

  it('holds several transfers at once', () => {
    const { start } = useRemoteProgressStore.getState()
    start('/a', 'fetch')
    start('/a', 'push')
    start('/b', 'pull')
    expect(entries()).toHaveLength(3)
  })

  it('stores the latest report against its own operation', () => {
    const { start, report } = useRemoteProgressStore.getState()
    start('/repo', 'push')
    report({
      repoPath: '/repo',
      operation: 'push',
      phase: 'writing',
      completed: 4,
      total: 10,
      bytes: 2048,
    })

    expect(entryFor('/repo', 'push')?.progress).toEqual({
      phase: 'writing',
      completed: 4,
      total: 10,
      bytes: 2048,
    })
  })

  it('ignores a report for a transfer it never saw start', () => {
    // Events broadcast to every webview; a report with no owner would otherwise create an entry
    // that nothing will ever finish.
    useRemoteProgressStore.getState().report({
      repoPath: '/ghost',
      operation: 'fetch',
      phase: 'receiving',
      completed: 1,
      total: 2,
      bytes: 10,
    })
    expect(entries()).toHaveLength(0)
  })

  it('ignores a report that arrives after the outcome', () => {
    // The transfer is over; a late packet must not put the card back into a running state.
    const { start, report, finish } = useRemoteProgressStore.getState()
    start('/repo', 'fetch')
    finish('/repo', 'fetch', { kind: 'success' })
    report({
      repoPath: '/repo',
      operation: 'fetch',
      phase: 'receiving',
      completed: 9,
      total: 10,
      bytes: 1,
    })

    expect(entryFor('/repo', 'fetch')?.progress).toBeNull()
    expect(entryFor('/repo', 'fetch')?.outcome).toEqual({ kind: 'success' })
  })

  it('records what a fetch brought back', () => {
    const { start, finish } = useRemoteProgressStore.getState()
    start('/repo', 'fetch')
    finish('/repo', 'fetch', { kind: 'success', updatedRefs: ['main → abc1234'] })

    expect(entryFor('/repo', 'fetch')?.outcome?.updatedRefs).toEqual(['main → abc1234'])
  })

  it('records why one failed', () => {
    const { start, finish } = useRemoteProgressStore.getState()
    start('/repo', 'push')
    finish('/repo', 'push', { kind: 'error', message: 'non-fast-forward' })

    expect(entryFor('/repo', 'push')?.outcome).toMatchObject({
      kind: 'error',
      message: 'non-fast-forward',
    })
  })

  it('ignores an outcome for a transfer it never saw start', () => {
    useRemoteProgressStore.getState().finish('/ghost', 'push', { kind: 'success' })
    expect(entries()).toHaveLength(0)
  })

  it('drops an entry once its card has been dealt with', () => {
    const { start, clear } = useRemoteProgressStore.getState()
    start('/repo', 'fetch')
    clear(remoteOperationKey('/repo', 'fetch'))
    expect(entries()).toHaveLength(0)
  })

  it('leaves the state untouched when clearing something that is not there', () => {
    const before = useRemoteProgressStore.getState().operations
    useRemoteProgressStore.getState().clear('nope')
    expect(useRemoteProgressStore.getState().operations).toBe(before)
  })

  it('keeps a second start from wiping the first transfer’s sibling', () => {
    const { start, report } = useRemoteProgressStore.getState()
    start('/repo', 'fetch')
    report({
      repoPath: '/repo',
      operation: 'fetch',
      phase: 'receiving',
      completed: 1,
      total: 2,
      bytes: 1,
    })
    start('/repo', 'push')

    expect(entryFor('/repo', 'fetch')?.progress).not.toBeNull()
  })

  it('resets a repeated operation rather than resuming the previous one’s counts', () => {
    const { start, report } = useRemoteProgressStore.getState()
    start('/repo', 'fetch')
    report({
      repoPath: '/repo',
      operation: 'fetch',
      phase: 'receiving',
      completed: 9,
      total: 10,
      bytes: 1,
    })
    start('/repo', 'fetch')

    expect(entryFor('/repo', 'fetch')?.progress).toBeNull()
  })
})
