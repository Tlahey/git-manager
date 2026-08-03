import { describe, it, expect, beforeEach } from 'vitest'
import {
  runActivity,
  getActiveCorrelation,
  openActivitySession,
  closeActivitySession,
  getActiveSession,
  resetActivitySessions,
} from './activityCorrelation'

describe('activityCorrelation', () => {
  it('has no active correlation outside runActivity', () => {
    expect(getActiveCorrelation()).toBeNull()
  })

  it('exposes a labelled correlation while the action runs', async () => {
    await runActivity('git.pull', async () => {
      const active = getActiveCorrelation()
      expect(active?.label).toBe('git.pull')
      expect(active?.id).toBeTruthy()
    })
    expect(getActiveCorrelation()).toBeNull()
  })

  it('keeps one stable id across awaits within the action', async () => {
    const ids: string[] = []
    await runActivity('git.rebase', async () => {
      ids.push(getActiveCorrelation()!.id)
      await Promise.resolve()
      ids.push(getActiveCorrelation()!.id)
    })
    expect(ids[0]).toBe(ids[1])
  })

  // The outermost call is the user's gesture: "create a branch here" runs apiCreateBranch and
  // apiCheckoutBranch, each of which wraps itself, and all of it is one thing the user did. This
  // is load-bearing beyond the log — the undo stack groups on this id, so a gesture split across
  // several ids came apart one operation at a time (and for create-branch, failed outright).
  it('keeps the outer correlation when nested, label included', async () => {
    await runActivity('outer', async () => {
      const outerId = getActiveCorrelation()!.id
      await runActivity('inner', async () => {
        expect(getActiveCorrelation()!.label).toBe('outer')
        expect(getActiveCorrelation()!.id).toBe(outerId)
      })
      expect(getActiveCorrelation()!.id).toBe(outerId)
    })
    expect(getActiveCorrelation()).toBeNull()
  })

  it('restores correlation even when the action throws', async () => {
    await expect(
      runActivity('boom', async () => {
        throw new Error('nope')
      })
    ).rejects.toThrow()
    expect(getActiveCorrelation()).toBeNull()
  })
})

describe('activity sessions', () => {
  beforeEach(() => {
    resetActivitySessions()
  })

  it('has no session before one is opened', () => {
    expect(getActiveSession('/repo/a', 'continue_rebase')).toBeNull()
  })

  it('labels a rebase session and keeps its id across its steps', () => {
    openActivitySession('/repo/a', 'rebase')
    const start = getActiveSession('/repo/a', 'run_interactive_rebase')
    const later = getActiveSession('/repo/a', 'continue_rebase')

    expect(start?.label).toBe('git.rebase')
    // The whole point: an id that survives the pause between two user actions.
    expect(later?.id).toBe(start?.id)
  })

  it('is idempotent for the same kind, so a step cannot start a second block', () => {
    openActivitySession('/repo/a', 'rebase')
    const first = getActiveSession('/repo/a', 'continue_rebase')?.id
    openActivitySession('/repo/a', 'rebase')

    expect(getActiveSession('/repo/a', 'continue_rebase')?.id).toBe(first)
  })

  it('replaces a session of a different kind', () => {
    openActivitySession('/repo/a', 'rebase')
    openActivitySession('/repo/a', 'bisect')

    expect(getActiveSession('/repo/a', 'continue_rebase')).toBeNull()
    expect(getActiveSession('/repo/a', 'bisect_mark')?.label).toBe('git.bisect')
  })

  it('captures the work a paused rebase is waiting on', () => {
    // Resolving a conflict and staging the result IS the rebase, not an aside.
    openActivitySession('/repo/a', 'rebase')

    for (const command of ['resolve_conflict', 'resolve_conflict_binary', 'stage_file', 'stage_all']) {
      expect(getActiveSession('/repo/a', command), command).not.toBeNull()
    }
  })

  it('leaves unrelated work during a paused rebase alone', () => {
    // A pause does not suspend the app: swallowing an unrelated push into the rebase's block would
    // be worse than not grouping it.
    openActivitySession('/repo/a', 'rebase')

    expect(getActiveSession('/repo/a', 'push_branch')).toBeNull()
    expect(getActiveSession('/repo/a', 'create_commit')).toBeNull()
    expect(getActiveSession('/repo/a', 'stash_push')).toBeNull()
  })

  it('does not treat staging as part of a bisect', () => {
    // The allowlists differ per kind on purpose: a bisect involves no staging.
    openActivitySession('/repo/a', 'bisect')

    expect(getActiveSession('/repo/a', 'stage_file')).toBeNull()
    expect(getActiveSession('/repo/a', 'bisect_reset')).not.toBeNull()
  })

  it('is scoped to one repository', () => {
    openActivitySession('/repo/a', 'rebase')

    expect(getActiveSession('/repo/b', 'continue_rebase')).toBeNull()
    expect(getActiveSession(undefined, 'continue_rebase')).toBeNull()
  })

  it('stops capturing once closed', () => {
    openActivitySession('/repo/a', 'rebase')
    closeActivitySession('/repo/a')

    expect(getActiveSession('/repo/a', 'continue_rebase')).toBeNull()
  })

  it('gives a later operation in the same repo a fresh id', () => {
    openActivitySession('/repo/a', 'rebase')
    const first = getActiveSession('/repo/a', 'continue_rebase')?.id
    closeActivitySession('/repo/a')
    openActivitySession('/repo/a', 'rebase')

    expect(getActiveSession('/repo/a', 'continue_rebase')?.id).not.toBe(first)
  })

  it('is independent of the per-action correlation', async () => {
    openActivitySession('/repo/a', 'rebase')
    await runActivity('git.commit', async () => {
      // Both layers can be live at once; the `invoke` wrapper is what picks between them.
      expect(getActiveCorrelation()?.label).toBe('git.commit')
      expect(getActiveSession('/repo/a', 'stage_file')?.label).toBe('git.rebase')
    })
  })
})
