import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GitGraphNode } from '@git-manager/git-types'

vi.mock('../api/ai.api', () => ({
  apiGetAiContext: vi.fn(),
  commitRecomposeService: { run: vi.fn() },
}))
vi.mock('../api/git.api', () => ({
  apiGetCommitDiff: vi.fn(),
  apiListRebaseCommits: vi.fn(),
  apiRunInteractiveRebase: vi.fn(),
}))

import { apiGetAiContext, commitRecomposeService } from '../api/ai.api'
import { apiGetCommitDiff, apiListRebaseCommits, apiRunInteractiveRebase } from '../api/git.api'
import { useCommitRecompose } from './useCommitRecompose'

const mocked = {
  context: apiGetAiContext as unknown as ReturnType<typeof vi.fn>,
  run: commitRecomposeService.run as unknown as ReturnType<typeof vi.fn>,
  diff: apiGetCommitDiff as unknown as ReturnType<typeof vi.fn>,
  range: apiListRebaseCommits as unknown as ReturnType<typeof vi.fn>,
  rebase: apiRunInteractiveRebase as unknown as ReturnType<typeof vi.fn>,
}

function node(oid: string, parents: string[] = []): GitGraphNode {
  return {
    commit: { oid, shortOid: oid.slice(0, 7), parentOids: parents, message: `old ${oid}` },
    refs: [],
  } as unknown as GitGraphNode
}

/** Newest first, as the graph holds them. */
const nodes = [node('ccc'), node('bbb'), node('aaa')]

const target = (oid: string) => ({ oid, shortOid: oid, message: `old ${oid}` })

beforeEach(() => {
  vi.clearAllMocks()
  mocked.context.mockResolvedValue({
    repoName: 'demo',
    diff: '',
    branch: 'main',
    files: [],
    commitConvention: null,
    recentCommits: [],
  })
  mocked.diff.mockResolvedValue({ files: [], totalAdditions: 3, totalDeletions: 1 })
  mocked.run.mockResolvedValue('feat: rewritten')
  mocked.range.mockResolvedValue([])
  mocked.rebase.mockResolvedValue(undefined)
})

describe('useCommitRecompose — generating', () => {
  it('writes one message per target, in order', async () => {
    const { result } = renderHook(() => useCommitRecompose('/repo', nodes))
    await act(async () => {
      await result.current.generate([target('aaa'), target('bbb')])
    })

    expect(mocked.run).toHaveBeenCalledTimes(2)
    expect(result.current.proposals.map((p) => p.oid)).toEqual(['aaa', 'bbb'])
    expect(result.current.proposals.every((p) => p.proposedMessage === 'feat: rewritten')).toBe(
      true
    )
  })

  it('never shows the model the message it is replacing', () => {
    // Guarded at the feature level too, but the hook is what assembles the input — a `message`
    // slipping into `commit` here would defeat that instruction silently.
    const { result } = renderHook(() => useCommitRecompose('/repo', nodes))
    return act(async () => {
      await result.current.generate([target('aaa')])
    }).then(() => {
      const input = mocked.run.mock.calls[0][1]
      expect(input.commit).not.toHaveProperty('message')
      expect(input.commit).not.toHaveProperty('subject')
    })
  })

  it('keeps the previous message on screen so the review can compare', async () => {
    const { result } = renderHook(() => useCommitRecompose('/repo', nodes))
    await act(async () => {
      await result.current.generate([target('aaa')])
    })
    expect(result.current.proposals[0].previousMessage).toBe('old aaa')
  })

  it('fetches the repo convention once, not once per commit', async () => {
    const { result } = renderHook(() => useCommitRecompose('/repo', nodes))
    await act(async () => {
      await result.current.generate([target('aaa'), target('bbb'), target('ccc')])
    })
    expect(mocked.context).toHaveBeenCalledTimes(1)
    expect(mocked.run).toHaveBeenCalledTimes(3)
  })

  it('declines an empty answer instead of rewriting a commit to nothing', async () => {
    mocked.run.mockResolvedValue('   ')
    const { result } = renderHook(() => useCommitRecompose('/repo', nodes))
    await act(async () => {
      await result.current.generate([target('aaa')])
    })
    expect(result.current.proposals[0].accepted).toBe(false)
    expect(result.current.canApply).toBe(false)
  })

  it('surfaces a failure and returns to idle', async () => {
    mocked.run.mockRejectedValue(new Error('provider down'))
    const { result } = renderHook(() => useCommitRecompose('/repo', nodes))
    await act(async () => {
      await result.current.generate([target('aaa')])
    })
    expect(result.current.error).toContain('provider down')
    expect(result.current.status).toBe('idle')
  })

  it('flags a merge so the model knows the patch is first-parent only', async () => {
    const merged = [node('mmm', ['bbb', 'side']), ...nodes]
    const { result } = renderHook(() => useCommitRecompose('/repo', merged))
    await act(async () => {
      await result.current.generate([{ oid: 'mmm', shortOid: 'mmm', message: 'merge' }])
    })
    expect(mocked.run.mock.calls[0][1].commit.isMerge).toBe(true)
  })
})

describe('useCommitRecompose — applying', () => {
  async function generated() {
    const hook = renderHook(() => useCommitRecompose('/repo', nodes))
    await act(async () => {
      await hook.result.current.generate([target('bbb'), target('ccc')])
    })
    return hook
  }

  it('rewords the accepted commits and picks everything else in the range', async () => {
    // The picks are not filler: they are what rewrites the descendants' SHAs while leaving their
    // messages alone, which is the consequence the dialog warns about.
    mocked.range.mockResolvedValue([
      { oid: 'bbb', shortOid: 'bbb' },
      { oid: 'ccc', shortOid: 'ccc' },
    ])
    const { result } = await generated()
    act(() => result.current.toggleAccepted('ccc'))

    await act(async () => {
      await result.current.apply()
    })

    expect(mocked.rebase).toHaveBeenCalledWith('/repo', 'bbb', [
      { oid: 'bbb', action: 'reword', message: 'feat: rewritten' },
      { oid: 'ccc', action: 'pick' },
    ])
  })

  it('starts the rebase at the OLDEST accepted commit', async () => {
    // Starting anywhere newer would leave the older target untouched by the todo.
    mocked.range.mockResolvedValue([
      { oid: 'bbb', shortOid: 'bbb' },
      { oid: 'ccc', shortOid: 'ccc' },
    ])
    const { result } = await generated()
    await act(async () => {
      await result.current.apply()
    })
    expect(mocked.range).toHaveBeenCalledWith('/repo', 'bbb')
    expect(mocked.rebase.mock.calls[0][1]).toBe('bbb')
  })

  it('writes nothing when every commit is set to keep its message', async () => {
    const { result } = await generated()
    act(() => {
      result.current.toggleAccepted('bbb')
      result.current.toggleAccepted('ccc')
    })

    await act(async () => {
      await result.current.apply()
    })

    expect(mocked.rebase).not.toHaveBeenCalled()
    expect(result.current.canApply).toBe(false)
  })

  it('ignores a proposal identical to the message already there', async () => {
    // Rewriting a commit to the text it already has would change its SHA for nothing.
    mocked.run.mockResolvedValue('old bbb')
    const hook = renderHook(() => useCommitRecompose('/repo', nodes))
    await act(async () => {
      await hook.result.current.generate([target('bbb')])
    })
    expect(hook.result.current.acceptedCount).toBe(0)

    await act(async () => {
      await hook.result.current.apply()
    })
    expect(mocked.rebase).not.toHaveBeenCalled()
  })

  it('carries a live edit into the rebase, not the original proposal', async () => {
    mocked.range.mockResolvedValue([{ oid: 'bbb', shortOid: 'bbb' }])
    const { result } = await generated()
    act(() => {
      result.current.toggleAccepted('ccc')
      result.current.setMessage('bbb', 'fix(auth): hand-edited  ')
    })

    await act(async () => {
      await result.current.apply()
    })

    expect(mocked.rebase.mock.calls[0][2][0].message).toBe('fix(auth): hand-edited')
  })

  it('reports a rebase failure instead of claiming success', async () => {
    mocked.range.mockResolvedValue([{ oid: 'bbb', shortOid: 'bbb' }])
    mocked.rebase.mockRejectedValue(new Error('rebase conflict'))
    const onApplied = vi.fn()
    const hook = renderHook(() => useCommitRecompose('/repo', nodes, onApplied))
    await act(async () => {
      await hook.result.current.generate([target('bbb')])
    })

    await act(async () => {
      await hook.result.current.apply()
    })

    expect(hook.result.current.error).toContain('rebase conflict')
    expect(onApplied).not.toHaveBeenCalled()
    expect(hook.result.current.status).toBe('idle')
  })

  it('notifies the caller once the rewrite lands', async () => {
    mocked.range.mockResolvedValue([{ oid: 'bbb', shortOid: 'bbb' }])
    const onApplied = vi.fn()
    const hook = renderHook(() => useCommitRecompose('/repo', nodes, onApplied))
    await act(async () => {
      await hook.result.current.generate([target('bbb')])
    })
    await act(async () => {
      await hook.result.current.apply()
    })
    expect(onApplied).toHaveBeenCalledOnce()
  })
})
