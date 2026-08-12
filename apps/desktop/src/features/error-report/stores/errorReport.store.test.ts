import { describe, it, expect, beforeEach } from 'vitest'
import { useErrorReportStore } from './errorReport.store'
import type { ErrorReportDraft } from '../lib/buildReport'

const DRAFT: ErrorReportDraft = {
  kind: 'operation',
  code: 'UNKNOWN',
  message: 'boom',
  timestamp: 1,
  context: [],
}

beforeEach(() => {
  useErrorReportStore.setState({ draft: null, reported: {} })
})

describe('errorReport.store', () => {
  it('starts closed', () => {
    expect(useErrorReportStore.getState().draft).toBeNull()
  })

  it('opens on a draft and closes back to null', () => {
    useErrorReportStore.getState().openReport(DRAFT)
    expect(useErrorReportStore.getState().draft).toEqual(DRAFT)

    useErrorReportStore.getState().closeReport()
    expect(useErrorReportStore.getState().draft).toBeNull()
  })

  it('replaces the draft outright, so a second failure never shows the first one’s data', () => {
    useErrorReportStore.getState().openReport(DRAFT)
    useErrorReportStore.getState().openReport({ ...DRAFT, message: 'other' })
    expect(useErrorReportStore.getState().draft?.message).toBe('other')
  })

  it('remembers which failures this session already filed, so a crash loop files one issue', () => {
    useErrorReportStore.getState().markReported('a1b2c3d4', 'https://example.test/1')
    useErrorReportStore.getState().markReported('deadbeef', 'https://example.test/2')

    expect(useErrorReportStore.getState().reported).toEqual({
      a1b2c3d4: 'https://example.test/1',
      deadbeef: 'https://example.test/2',
    })
  })

  it('is not persisted — the durable record of a report is the issue itself', () => {
    useErrorReportStore.getState().markReported('a1b2c3d4', 'https://example.test/1')
    expect(Object.keys(localStorage)).toHaveLength(0)
  })
})
