import { describe, it, expect } from 'vitest'
import { buildActionPool, ACTION_POOL_SIZE } from './actionPool'
import type { ActivityLogEntry } from '../stores/activityLog.store'

let clock = 1_000_000

/** An activity entry, with the fields a test cares about. Entries are newest-first in the store, so
 * helpers here are written in the order they are passed to `buildActionPool`. */
function entry(overrides: Partial<ActivityLogEntry> & { command: string }): ActivityLogEntry {
  return {
    id: `e${clock}`,
    timestamp: clock--,
    durationMs: 5,
    status: 'ok',
    ...overrides,
  }
}

describe('buildActionPool', () => {
  it('keeps only the operations that changed the repository', () => {
    const pool = buildActionPool([
      entry({ command: 'get_repo_status', args: { path: '/repo' } }),
      entry({ command: 'stage_file', args: { path: '/repo', filePath: 'a.ts' } }),
      entry({ command: 'get_log', args: { path: '/repo' } }),
    ])

    expect(pool).toHaveLength(1)
    expect(pool[0]?.commands.map((c) => c.command)).toEqual(['stage_file'])
  })

  it('returns nothing when the log holds only reads', () => {
    expect(buildActionPool([entry({ command: 'get_log', args: { path: '/repo' } })])).toEqual([])
  })

  it('groups the operations of one correlated action, even with reads interleaved', () => {
    // The reads a commit triggers sit between its writes in the real log. Filtering has to happen
    // before grouping or this splits into two actions.
    const pool = buildActionPool([
      entry({
        command: 'create_commit',
        args: { path: '/repo', message: 'feat: x' },
        correlationId: 'c1',
        correlationLabel: 'git.commit',
      }),
      entry({ command: 'get_repo_status', args: { path: '/repo' } }),
      entry({
        command: 'stage_all',
        args: { path: '/repo' },
        correlationId: 'c1',
        correlationLabel: 'git.commit',
      }),
    ])

    expect(pool).toHaveLength(1)
    // Identified by its first operation, not by the correlation id — see `PooledAction.id`.
    expect(pool[0]?.id).toBe(pool[0]?.commands[0]?.entryId)
    expect(pool[0]?.label).toBe('git.commit')
    expect(pool[0]?.commands.map((c) => c.command)).toEqual(['stage_all', 'create_commit'])
  })

  it("orders an action's commands the way they ran", () => {
    const pool = buildActionPool([
      entry({ command: 'stage_file', args: { filePath: 'second.ts' }, correlationId: 'c1' }),
      entry({ command: 'stage_file', args: { filePath: 'first.ts' }, correlationId: 'c1' }),
    ])

    expect(pool[0]?.commands.flatMap((c) => c.lines)).toEqual([
      'git add -- first.ts',
      'git add -- second.ts',
    ])
  })

  it('titles a correlated action from its label, not from its last command', () => {
    const pool = buildActionPool([
      entry({
        command: 'create_commit',
        args: { message: 'feat: x' },
        correlationId: 'c1',
        correlationLabel: 'git.pull',
      }),
    ])

    expect(pool[0]?.titleKey).toBe('gitCommand.action.pull')
  })

  it('titles an uncorrelated action from the operation itself', () => {
    const pool = buildActionPool([entry({ command: 'stash_pop', args: { index: 1 } })])

    expect(pool[0]?.label).toBeUndefined()
    expect(pool[0]?.titleKey).toBe('gitCommand.stashPop')
    expect(pool[0]?.family).toBe('stash')
  })

  it('falls back to the last command when the label is one it does not know', () => {
    const pool = buildActionPool([
      entry({ command: 'stash_drop', args: {}, correlationId: 'c1', correlationLabel: 'git.wat' }),
    ])

    expect(pool[0]?.titleKey).toBe('gitCommand.stashDrop')
  })

  it('reports the action as failed as soon as one of its operations failed', () => {
    const pool = buildActionPool([
      entry({
        command: 'create_commit',
        args: { message: 'x' },
        status: 'error',
        error: 'nothing to commit',
        correlationId: 'c1',
      }),
      entry({ command: 'stage_all', args: {}, correlationId: 'c1' }),
    ])

    expect(pool[0]?.status).toBe('error')
    expect(pool[0]?.commands[1]?.error).toBe('nothing to commit')
  })

  it('records the repository an action targeted', () => {
    const pool = buildActionPool([
      entry({ command: 'push_branch', args: { path: '/repo/one' }, repoPath: '/repo/one' }),
    ])

    expect(pool[0]?.repoPath).toBe('/repo/one')
  })

  it('sums the duration of every operation in the action', () => {
    const pool = buildActionPool([
      entry({ command: 'create_commit', args: {}, durationMs: 30, correlationId: 'c1' }),
      entry({ command: 'stage_all', args: {}, durationMs: 12, correlationId: 'c1' }),
    ])

    expect(pool[0]?.totalDurationMs).toBe(42)
  })

  it('gathers a whole rebase — its steps and its conflict work — into one block', () => {
    // The steps are separate user actions minutes apart; they share the session id the rebase opened
    // (see `activityCorrelation.ts`), which is what makes them one block here.
    const session = { correlationId: 'op-1', correlationLabel: 'git.rebase' }
    const pool = buildActionPool([
      entry({ command: 'continue_rebase', args: { path: '/repo' }, ...session }),
      entry({ command: 'stage_file', args: { filePath: 'a.ts' }, ...session }),
      entry({ command: 'resolve_conflict', args: { filePath: 'a.ts' }, ...session }),
      entry({ command: 'get_rebase_state', args: { path: '/repo' } }),
      entry({ command: 'rebase_onto_commit', args: { targetOid: 'abc1234' }, ...session }),
    ])

    expect(pool).toHaveLength(1)
    expect(pool[0]?.titleKey).toBe('gitCommand.action.rebase')
    expect(pool[0]?.commands.flatMap((c) => c.lines)).toEqual([
      'git rebase abc1234',
      // Resolving the conflict, then telling git it is settled — both `git add` mid-rebase.
      'git add -- a.ts',
      'git add -- a.ts',
      'git rebase --continue',
    ])
  })

  it('titles a bisect session as one operation too', () => {
    const session = { correlationId: 'op-2', correlationLabel: 'git.bisect' }
    const pool = buildActionPool([
      entry({ command: 'bisect_mark', args: { term: 'good' }, ...session }),
      entry({ command: 'bisect_start', args: { badRev: 'HEAD', goodRev: 'v1' }, ...session }),
    ])

    expect(pool).toHaveLength(1)
    expect(pool[0]?.titleKey).toBe('gitCommand.action.bisect')
  })

  it('identifies a block by its first operation, so a split session cannot collide', () => {
    // `groupActivityLog` only merges *consecutive* entries, so an unrelated action between two rebase
    // steps yields two blocks carrying the same session id. Keying on it would duplicate React keys
    // and make two rows share one remembered explanation.
    const session = { correlationId: 'op-3', correlationLabel: 'git.rebase' }
    const pool = buildActionPool([
      entry({ command: 'continue_rebase', args: { path: '/repo' }, id: 'late', ...session }),
      entry({ command: 'push_branch', args: { path: '/repo' }, id: 'aside' }),
      entry({ command: 'rebase_onto_commit', args: { targetOid: 'abc' }, id: 'early', ...session }),
    ])

    expect(pool.map((a) => a.id)).toEqual(['late', 'aside', 'early'])
    expect(new Set(pool.map((a) => a.id)).size).toBe(3)
  })

  it('keeps a block id stable as later steps are appended', () => {
    // A remembered explanation must stay attached to the rebase while it is still running.
    const session = { correlationId: 'op-4', correlationLabel: 'git.rebase' }
    const started = entry({ command: 'rebase_onto_commit', args: { targetOid: 'abc' }, ...session })
    const before = buildActionPool([started])

    const continued = entry({ command: 'continue_rebase', args: { path: '/repo' }, ...session })
    const after = buildActionPool([continued, started])

    expect(after[0]?.id).toBe(before[0]?.id)
    expect(after[0]?.commands).toHaveLength(2)
  })

  it('caps the pool at the requested number of actions, keeping the newest', () => {
    const entries = Array.from({ length: 60 }, (_, i) =>
      entry({ command: 'stage_file', args: { filePath: `f${i}.ts` } })
    )

    const pool = buildActionPool(entries)
    expect(pool).toHaveLength(ACTION_POOL_SIZE)
    // Entries arrive newest-first, so the first one in is the newest action out.
    expect(pool[0]?.commands[0]?.lines).toEqual(['git add -- f0.ts'])

    expect(buildActionPool(entries, 3)).toHaveLength(3)
  })
})
