import { describe, it, expect, beforeEach } from 'vitest'
import { useHookProgressStore } from './hookProgress.store'

const REPO = '/tmp/repo'

beforeEach(() => {
  useHookProgressStore.setState({ running: {} })
})

function report(event: Parameters<ReturnType<typeof useHookProgressStore.getState>['report']>[0]) {
  useHookProgressStore.getState().report(event)
}

describe('hookProgress.store', () => {
  it('holds the hook that started', () => {
    report({ repoPath: REPO, name: 'pre-commit', phase: 'started' })

    expect(useHookProgressStore.getState().running[REPO]).toMatchObject({
      repoPath: REPO,
      name: 'pre-commit',
    })
  })

  it('drops it once it finishes', () => {
    report({ repoPath: REPO, name: 'pre-commit', phase: 'started' })
    report({ repoPath: REPO, name: 'pre-commit', phase: 'finished', success: true })

    expect(useHookProgressStore.getState().running[REPO]).toBeUndefined()
  })

  // Git runs a commit's hooks strictly in sequence, so the second one starting replaces the first
  // rather than joining it — one repository has at most one hook in flight.
  it('replaces the running hook when the next one starts', () => {
    report({ repoPath: REPO, name: 'pre-commit', phase: 'started' })
    report({ repoPath: REPO, name: 'commit-msg', phase: 'started' })

    expect(useHookProgressStore.getState().running[REPO]?.name).toBe('commit-msg')
  })

  // The failure this guards: a late `finished` for a hook that has already been replaced would
  // otherwise clear the one actually running, and the card would vanish mid-wait.
  it('ignores a finish for a hook it is no longer showing', () => {
    report({ repoPath: REPO, name: 'pre-commit', phase: 'started' })
    report({ repoPath: REPO, name: 'commit-msg', phase: 'started' })
    report({ repoPath: REPO, name: 'pre-commit', phase: 'finished', success: true })

    expect(useHookProgressStore.getState().running[REPO]?.name).toBe('commit-msg')
  })

  it('keeps two repositories apart', () => {
    report({ repoPath: REPO, name: 'pre-commit', phase: 'started' })
    report({ repoPath: '/tmp/other', name: 'pre-push', phase: 'started' })

    report({ repoPath: REPO, name: 'pre-commit', phase: 'finished', success: false })

    expect(useHookProgressStore.getState().running[REPO]).toBeUndefined()
    expect(useHookProgressStore.getState().running['/tmp/other']?.name).toBe('pre-push')
  })

  it('clears a repository on demand', () => {
    report({ repoPath: REPO, name: 'pre-commit', phase: 'started' })
    useHookProgressStore.getState().clear(REPO)

    expect(useHookProgressStore.getState().running[REPO]).toBeUndefined()
  })
})
