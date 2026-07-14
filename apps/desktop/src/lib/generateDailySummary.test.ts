import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AiActivity, AiConnectionConfig, DailySummary } from '@git-manager/ai'

const { apiGetAiActivity, run } = vi.hoisted(() => ({
  apiGetAiActivity: vi.fn(),
  run: vi.fn(),
}))
vi.mock('../api/ai.api', () => ({
  apiGetAiActivity,
  dailySummaryService: { run },
}))

import { generateDailySummary } from './generateDailySummary'
import { useDailySummaryStore } from '../stores/dailySummary.store'

const connection = { preset: 'ollama', url: 'x', model: 'm', timeoutSeconds: 30 } as AiConnectionConfig
const activity: AiActivity = {
  repoName: 'demo',
  branch: 'main',
  commits: [],
  pending: [],
  truncated: false,
}
const summary: DailySummary = { headline: 'H', yesterday: ['a'], today: ['b'] }

beforeEach(() => {
  vi.clearAllMocks()
  useDailySummaryStore.setState({ summaries: {} })
  apiGetAiActivity.mockResolvedValue({ ...activity })
  run.mockResolvedValue(summary)
})

describe('generateDailySummary', () => {
  it('injects the UI language into the activity before running the feature', async () => {
    await generateDailySummary('/repo/a', connection, 'fr')
    expect(apiGetAiActivity).toHaveBeenCalledWith('/repo/a', expect.any(Number))
    const passedActivity = run.mock.calls[0][1] as AiActivity
    expect(passedActivity.language).toBe('fr')
    expect(run).toHaveBeenCalledWith(connection, expect.objectContaining({ language: 'fr' }))
  })

  it('persists the produced summary in the launchpad store', async () => {
    const result = await generateDailySummary('/repo/a', connection, 'en')
    expect(result).toEqual(summary)
    expect(useDailySummaryStore.getState().summaries['/repo/a'].summary).toEqual(summary)
  })
})
