import { describe, it, expect } from 'vitest'
import type { ActivityLogEntry } from '../stores/activityLog.store'
import {
  formatActivityLogEntry,
  formatActivityLogText,
  formatActivityTimestamp,
} from './formatActivityLog'

function entry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: '1',
    timestamp: new Date('2026-07-12T09:08:07.006').getTime(),
    command: 'get_log',
    args: { path: '/repo' },
    durationMs: 12,
    status: 'ok',
    ...overrides,
  }
}

describe('formatActivityTimestamp', () => {
  it('formats local wall-clock time with milliseconds', () => {
    expect(formatActivityTimestamp(new Date('2026-07-12T09:08:07.006').getTime())).toBe(
      '09:08:07.006'
    )
  })
})

describe('formatActivityLogEntry', () => {
  it('renders a single line for a successful entry with args', () => {
    const line = formatActivityLogEntry(entry())
    expect(line).toContain('OK')
    expect(line).toContain('12ms')
    expect(line).toContain('get_log')
    expect(line).toContain('{"path":"/repo"}')
    expect(line).not.toContain('\n')
  })

  it('appends an indented error line when the entry failed', () => {
    const line = formatActivityLogEntry(entry({ status: 'error', error: 'boom' }))
    expect(line).toContain('ERROR')
    expect(line).toMatch(/\n\s+↳ boom/)
  })

  it('renders string args verbatim (already redacted upstream)', () => {
    expect(formatActivityLogEntry(entry({ args: '[redacted]' }))).toContain('[redacted]')
  })
})

describe('formatActivityLogText', () => {
  it('emits entries oldest-first (buffer is stored newest-first)', () => {
    const newest = entry({ id: 'b', command: 'second' })
    const oldest = entry({ id: 'a', command: 'first' })
    const text = formatActivityLogText([newest, oldest])
    expect(text.indexOf('first')).toBeLessThan(text.indexOf('second'))
  })
})
