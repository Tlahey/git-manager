import { describe, it, expect } from 'vitest'
import { resolveCiStatus } from './ciStatus'
import type { GhCheckRunsResponse, GhCommitStatusResponse } from '../api/github.api'

function checkRuns(
  runs: Array<{ name?: string; status: string; conclusion: string | null; html_url?: string }>
): GhCheckRunsResponse {
  return { total_count: runs.length, check_runs: runs }
}

function statuses(
  list: Array<{ state: string; context?: string; target_url?: string }>,
  overall: string
): GhCommitStatusResponse {
  return { total_count: list.length, state: overall, statuses: list }
}

describe('resolveCiStatus', () => {
  it('returns null/empty when there is no CI at all', () => {
    expect(resolveCiStatus(null, null)).toEqual({ overall: null, details: [] })
    expect(resolveCiStatus(checkRuns([]), statuses([], ''))).toEqual({
      overall: null,
      details: [],
    })
  })

  it('treats failure/timed_out/cancelled check-runs as an overall failure', () => {
    for (const conclusion of ['failure', 'timed_out', 'cancelled']) {
      const res = resolveCiStatus(
        checkRuns([{ name: 'build', status: 'completed', conclusion }]),
        null
      )
      expect(res.overall).toBe('failure')
    }
  })

  it('treats failure/error commit statuses as an overall failure', () => {
    expect(resolveCiStatus(null, statuses([{ state: 'failure' }], 'failure')).overall).toBe(
      'failure'
    )
    expect(resolveCiStatus(null, statuses([{ state: 'error' }], 'error')).overall).toBe('failure')
  })

  it('failure wins over a still-running check', () => {
    const res = resolveCiStatus(
      checkRuns([
        { name: 'lint', status: 'in_progress', conclusion: null },
        { name: 'test', status: 'completed', conclusion: 'failure' },
      ]),
      null
    )
    expect(res.overall).toBe('failure')
  })

  it('reports running when a check is queued or in_progress and nothing failed', () => {
    expect(
      resolveCiStatus(checkRuns([{ name: 'a', status: 'queued', conclusion: null }]), null).overall
    ).toBe('running')
    expect(
      resolveCiStatus(
        checkRuns([{ name: 'a', status: 'in_progress', conclusion: null }]),
        null
      ).overall
    ).toBe('running')
    expect(resolveCiStatus(null, statuses([{ state: 'pending' }], 'pending')).overall).toBe(
      'running'
    )
  })

  it('reports success when everything completed successfully', () => {
    expect(
      resolveCiStatus(
        checkRuns([{ name: 'build', status: 'completed', conclusion: 'success' }]),
        statuses([{ state: 'success' }], 'success')
      ).overall
    ).toBe('success')
  })

  it('reports skipped only when every check was skipped/neutral', () => {
    expect(
      resolveCiStatus(
        checkRuns([
          { name: 'a', status: 'completed', conclusion: 'skipped' },
          { name: 'b', status: 'completed', conclusion: 'neutral' },
        ]),
        null
      ).overall
    ).toBe('skipped')
  })

  it('builds a detail row per check-run then per commit status', () => {
    const res = resolveCiStatus(
      checkRuns([
        { name: 'build', status: 'completed', conclusion: 'success', html_url: 'u1' },
        { name: 'lint', status: 'in_progress', conclusion: null },
      ]),
      statuses([{ state: 'failure', context: 'coverage', target_url: 'u2' }], 'failure')
    )
    expect(res.details).toEqual([
      { name: 'build', status: 'success', url: 'u1' },
      { name: 'lint', status: 'running', url: undefined },
      { name: 'coverage', status: 'failure', url: 'u2' },
    ])
  })

  it('falls back to default names and unknown status for unrecognized shapes', () => {
    const res = resolveCiStatus(
      checkRuns([{ status: 'completed', conclusion: 'action_required' }]),
      statuses([{ state: 'weird' }], 'pending')
    )
    expect(res.details[0]).toEqual({ name: 'Check run', status: 'unknown', url: undefined })
    expect(res.details[1]).toEqual({ name: 'Status check', status: 'unknown', url: undefined })
  })
})
