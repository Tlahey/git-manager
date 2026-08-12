import { describe, it, expect } from 'vitest'
import { buildErrorReport, buildReportTitle, type ErrorReportDraft } from './buildReport'
import type { ActivityLogEntry } from '../../../stores/activityLog.store'

const ENV = {
  appVersion: '0.2.1',
  platform: 'macOS · WebKit build 605.1.15',
  locale: 'fr',
  userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15',
}

function entry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: '1',
    timestamp: 1_700_000_000_000,
    command: 'git_fetch',
    durationMs: 12,
    status: 'ok',
    ...overrides,
  }
}

function draft(overrides: Partial<ErrorReportDraft> = {}): ErrorReportDraft {
  return {
    kind: 'operation',
    code: 'UNKNOWN',
    message: 'something broke',
    command: 'git_push',
    timestamp: 1_700_000_000_000,
    context: [],
    ...overrides,
  }
}

describe('buildReportTitle', () => {
  it('leads with the error code', () => {
    expect(buildReportTitle(draft({ code: 'IO_ERROR', message: 'disk is full' }))).toBe(
      'IO_ERROR: disk is full'
    )
  })

  it('labels a crash as one, since it has no code', () => {
    expect(buildReportTitle(draft({ kind: 'crash', code: undefined, message: 'x is null' }))).toBe(
      'UI crash: x is null'
    )
  })

  it('keeps only the first line, so a multi-line error is still a title', () => {
    expect(buildReportTitle(draft({ message: 'failed\nbecause of things' }))).toBe(
      'UNKNOWN: failed'
    )
  })

  it('redacts the title too — it is the most visible part of the issue', () => {
    const title = buildReportTitle(draft({ message: 'cannot open /Users/antoine/acme/a.ts' }))
    expect(title).toBe('UNKNOWN: cannot open <path>')
  })

  it('truncates a title too long to read in a tracker list', () => {
    const title = buildReportTitle(draft({ message: 'x'.repeat(300) }))
    expect(title.length).toBeLessThanOrEqual(110)
    expect(title.endsWith('…')).toBe(true)
  })
})

describe('buildErrorReport', () => {
  it('stamps the fingerprint marker as the very first line, where the duplicate search finds it', () => {
    const report = buildErrorReport(draft(), ENV)
    expect(report.body.split('\n')[0]).toBe(`<!-- gm-fp:${report.fingerprint} -->`)
  })

  it('carries the verdict and its reason, so the dialog need not classify twice', () => {
    expect(buildErrorReport(draft({ code: 'PROTECTED_BRANCH' }), ENV).verdict).toBe('expected')
    expect(buildErrorReport(draft({ code: 'GIT_ERROR' }), ENV).verdict).toBe('unclear')
  })

  it('includes the reporter’s description, and says plainly when there is none', () => {
    expect(buildErrorReport(draft(), ENV, '  I clicked push  ').body).toContain('I clicked push')
    expect(buildErrorReport(draft(), ENV, '   ').body).toContain('_No description given._')
  })

  it('never lets the repository path through, in the error block or the table', () => {
    const report = buildErrorReport(
      draft({
        repoPath: '/Users/antoine/Workspace/acme-client',
        message: 'failed in /Users/antoine/Workspace/acme-client/src/a.ts',
        context: [entry({ repoPath: '/Users/antoine/Workspace/acme-client', status: 'error' })],
      }),
      ENV
    )
    expect(report.body).not.toContain('acme-client')
    expect(report.body).not.toContain('/Users/antoine')
    expect(report.body).toMatch(/<repo:[0-9a-f]{8}>/)
  })

  it('never lets an argument value through, only its shape', () => {
    const report = buildErrorReport(
      draft({ context: [entry({ args: { branch: 'feature/PROJ-4211-billing', limit: 50 } })] }),
      ENV
    )
    expect(report.body).not.toContain('PROJ-4211')
    expect(report.body).toContain('branch:string(25)')
    expect(report.body).toContain('limit=50')
  })

  it('orders the operation table oldest-first, unlike the live stream', () => {
    const report = buildErrorReport(
      draft({
        context: [
          entry({ id: '2', command: 'git_second', timestamp: 2 }),
          entry({ id: '1', command: 'git_first', timestamp: 1 }),
        ],
      }),
      ENV
    )
    expect(report.body.indexOf('git_first')).toBeLessThan(report.body.indexOf('git_second'))
  })

  it('caps how many operations travel with a report', () => {
    const context = Array.from({ length: 60 }, (_, i) => entry({ id: String(i) }))
    const report = buildErrorReport(draft({ context }), ENV)
    expect(report.body.match(/git_fetch/g)).toHaveLength(25)
  })

  it('says so rather than faking a table when nothing was recorded', () => {
    expect(buildErrorReport(draft({ context: [] }), ENV).body).toContain('_None recorded._')
  })

  it('keeps a crash stack readable — line numbers and all', () => {
    const report = buildErrorReport(
      draft({
        kind: 'crash',
        code: undefined,
        stack: 'at render (tauri://localhost/assets/index-a1b2.js:1:4821)',
        componentStack: '\n    at GraphPage',
      }),
      ENV
    )
    expect(report.body).toContain('index-a1b2.js:1:4821')
    expect(report.body).toContain('at GraphPage')
  })

  it('does not let a fenced block in the error break out of the code fence', () => {
    const report = buildErrorReport(draft({ detail: 'hook said ```oops```' }), ENV)
    expect(report.body).toContain('````')
  })

  it('reports the environment, and no token that reached the user agent', () => {
    const report = buildErrorReport(draft(), {
      ...ENV,
      userAgent: 'UA ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    })
    expect(report.body).toContain('- App: 0.2.1')
    expect(report.body).toContain('- Locale: fr')
    expect(report.body).not.toContain('ghp_')
  })
})
