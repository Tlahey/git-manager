import { describe, expect, it } from 'vitest'
import type { GitWorktree, TerminalStatus } from '@git-manager/git-types'
import { summarizeWorktreeTerminals, sortWorktreesByTerminal } from './worktreeTerminals'

const session = (id: string, cwd: string) => ({ id, title: `zsh ${id}`, cwd })

const status = (id: string, busy: boolean, command: string | null = null): TerminalStatus => ({
  id,
  busy,
  command,
})

const activityOf = (...statuses: TerminalStatus[]): Record<string, TerminalStatus> =>
  Object.fromEntries(statuses.map((s) => [s.id, s]))

const worktree = (path: string): GitWorktree =>
  ({ path, branch: path.split('/').pop(), isMain: false }) as GitWorktree

describe('summarizeWorktreeTerminals', () => {
  it('has no entry for a directory with no session', () => {
    const summaries = summarizeWorktreeTerminals([], {})
    expect(summaries.get('/repo')).toBeUndefined()
  })

  it('reports an idle session with no command', () => {
    const summaries = summarizeWorktreeTerminals(
      [session('a', '/repo')],
      activityOf(status('a', false))
    )
    expect(summaries.get('/repo')).toEqual({
      count: 1,
      busy: false,
      command: null,
      sessionId: 'a',
    })
  })

  it('names the command running in a busy session', () => {
    const summaries = summarizeWorktreeTerminals(
      [session('a', '/repo')],
      activityOf(status('a', true, 'claude'))
    )
    expect(summaries.get('/repo')).toMatchObject({ busy: true, command: 'claude' })
  })

  it('counts every session bound to the same directory', () => {
    const summaries = summarizeWorktreeTerminals(
      [session('a', '/repo'), session('b', '/repo'), session('c', '/other')],
      {}
    )
    expect(summaries.get('/repo')?.count).toBe(2)
    expect(summaries.get('/other')?.count).toBe(1)
  })

  it('makes the busy session the click target, whatever its position', () => {
    const summaries = summarizeWorktreeTerminals(
      [session('idle', '/repo'), session('agent', '/repo'), session('other-idle', '/repo')],
      activityOf(status('agent', true, 'claude'))
    )
    expect(summaries.get('/repo')).toMatchObject({
      count: 3,
      busy: true,
      command: 'claude',
      sessionId: 'agent',
    })
  })

  it('targets the most recent session when none is busy', () => {
    const summaries = summarizeWorktreeTerminals([session('a', '/repo'), session('b', '/repo')], {})
    expect(summaries.get('/repo')?.sessionId).toBe('b')
  })

  it('treats a session missing from the activity map as idle rather than unknown', () => {
    // The poll has not come back yet, or the session was opened between two polls.
    const summaries = summarizeWorktreeTerminals([session('a', '/repo')], {})
    expect(summaries.get('/repo')).toMatchObject({ busy: false, command: null })
  })
})

describe('sortWorktreesByTerminal', () => {
  const worktrees = [worktree('/wt/a'), worktree('/wt/b'), worktree('/wt/c'), worktree('/wt/d')]

  it('floats a worktree running a command above one that only has a shell open', () => {
    const summaries = summarizeWorktreeTerminals(
      [session('idle', '/wt/b'), session('agent', '/wt/d')],
      activityOf(status('agent', true, 'claude'))
    )
    expect(sortWorktreesByTerminal(worktrees, summaries).map((wt) => wt.path)).toEqual([
      '/wt/d',
      '/wt/b',
      '/wt/a',
      '/wt/c',
    ])
  })

  it('keeps the incoming order when nothing is running', () => {
    expect(sortWorktreesByTerminal(worktrees, new Map()).map((wt) => wt.path)).toEqual([
      '/wt/a',
      '/wt/b',
      '/wt/c',
      '/wt/d',
    ])
  })

  it('does not mutate the array it was given', () => {
    const summaries = summarizeWorktreeTerminals(
      [session('agent', '/wt/d')],
      activityOf(status('agent', true))
    )
    sortWorktreesByTerminal(worktrees, summaries)
    expect(worktrees.map((wt) => wt.path)).toEqual(['/wt/a', '/wt/b', '/wt/c', '/wt/d'])
  })
})
