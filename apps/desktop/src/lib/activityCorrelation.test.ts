import { describe, it, expect } from 'vitest'
import { runActivity, getActiveCorrelation } from './activityCorrelation'

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

  it('restores the previous correlation when nested', async () => {
    await runActivity('outer', async () => {
      const outerId = getActiveCorrelation()!.id
      await runActivity('inner', async () => {
        expect(getActiveCorrelation()!.label).toBe('inner')
        expect(getActiveCorrelation()!.id).not.toBe(outerId)
      })
      expect(getActiveCorrelation()!.id).toBe(outerId)
    })
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
