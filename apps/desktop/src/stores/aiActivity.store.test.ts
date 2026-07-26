import { describe, it, expect, beforeEach } from 'vitest'
import { useAiActivityStore, withAiActivity } from './aiActivity.store'

beforeEach(() => {
  useAiActivityStore.setState({ runs: [] })
})

describe('aiActivity.store', () => {
  it('starts idle', () => {
    expect(useAiActivityStore.getState().runs).toEqual([])
  })

  it('tracks a run between begin and end', () => {
    const runId = useAiActivityStore.getState().begin('commit-message')
    expect(useAiActivityStore.getState().runs).toHaveLength(1)
    expect(useAiActivityStore.getState().runs[0]).toMatchObject({
      runId,
      featureId: 'commit-message',
    })

    useAiActivityStore.getState().end(runId)
    expect(useAiActivityStore.getState().runs).toEqual([])
  })

  it('keeps concurrent runs apart, ending only the one asked for', () => {
    const first = useAiActivityStore.getState().begin('pr-description')
    const second = useAiActivityStore.getState().begin('branch-explanation')
    expect(useAiActivityStore.getState().runs).toHaveLength(2)

    useAiActivityStore.getState().end(first)
    const runs = useAiActivityStore.getState().runs
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ runId: second, featureId: 'branch-explanation' })
  })

  it('ignores an unknown or already-ended run id', () => {
    const runId = useAiActivityStore.getState().begin('daily-summary')
    useAiActivityStore.getState().end(runId)
    useAiActivityStore.getState().end(runId)
    useAiActivityStore.getState().end(9999)
    expect(useAiActivityStore.getState().runs).toEqual([])
  })
})

describe('withAiActivity', () => {
  it('brackets a successful call and returns its value', async () => {
    let duringRun = 0
    const result = await withAiActivity('file-grouping', async () => {
      duringRun = useAiActivityStore.getState().runs.length
      return 'done'
    })
    expect(duringRun).toBe(1)
    expect(result).toBe('done')
    expect(useAiActivityStore.getState().runs).toEqual([])
  })

  it('clears the run when the call rejects — a failure must not spin forever', async () => {
    await expect(
      withAiActivity('commit-message', async () => {
        throw new Error('provider down')
      })
    ).rejects.toThrow()
    expect(useAiActivityStore.getState().runs).toEqual([])
  })

  it('reports the feature that is running', async () => {
    let seen = ''
    await withAiActivity('change-explanation', async () => {
      seen = useAiActivityStore.getState().runs[0].featureId
    })
    expect(seen).toBe('change-explanation')
  })
})
